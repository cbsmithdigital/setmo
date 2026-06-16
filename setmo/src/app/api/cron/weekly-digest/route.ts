import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api";
import { isEmailConfigured, sendDigestEmail } from "@/lib/email";
import { buildOfficeDigest, buildGroupDigest, buildSetterDigest, type DigestEmail } from "@/lib/digest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/cron/weekly-digest — Vercel Cron entrypoint. Builds and sends the
// weekly digests to office admins (per practice), group admins (portfolio), and
// setters (personal). Scoped to accounts active in the last 7 days.
//   ?dryRun=1            build only, don't send (returns subjects)
//   ?scope=office|group|setter   limit to one audience (testing)
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return error("Unauthorized", 401);
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const only = url.searchParams.get("scope"); // office | group | setter | null
  const testTo = url.searchParams.get("test"); // send every built digest to this one address (review/testing)
  const want = (s: string) => !only || only === s;

  if (!dryRun && !isEmailConfigured()) return error("Email not configured", 503);

  const since = new Date(Date.now() - 7 * 86400_000);
  const recent = await prisma.session.findMany({
    where: { status: "SCORED", durationSeconds: { gte: 60 }, startedAt: { gte: since } },
    select: { officeId: true, setterId: true },
  });
  const officeIds = [...new Set(recent.map((r) => r.officeId))];
  const setterIds = [...new Set(recent.map((r) => r.setterId))];

  const orgIds = officeIds.length
    ? [...new Set((await prisma.office.findMany({ where: { id: { in: officeIds }, organizationId: { not: null } }, select: { organizationId: true } })).map((o) => o.organizationId!))]
    : [];

  const summary = { offices: { built: 0, sent: 0 }, groups: { built: 0, sent: 0 }, setters: { built: 0, sent: 0 } };
  const samples: string[] = [];

  const run = async (bucket: { built: number; sent: number }, d: DigestEmail | null) => {
    if (!d) return;
    const to = testTo ? [testTo] : d.recipients;
    if (to.length === 0) return;
    bucket.built++;
    samples.push(`${to.length}× ${d.subject}`);
    if (!dryRun) bucket.sent += await sendDigestEmail({ to, subject: d.subject, html: d.html });
  };

  if (want("office")) for (const id of officeIds) await run(summary.offices, await buildOfficeDigest(id).catch(() => null));
  if (want("group")) for (const id of orgIds) await run(summary.groups, await buildGroupDigest(id).catch(() => null));
  if (want("setter")) for (const id of setterIds) await run(summary.setters, await buildSetterDigest(id).catch(() => null));

  return json({ ok: true, dryRun, summary, ...(dryRun ? { samples } : {}) });
}
