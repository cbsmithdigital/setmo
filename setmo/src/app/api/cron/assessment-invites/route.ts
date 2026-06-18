import { json, error } from "@/lib/api";
import { isEmailConfigured } from "@/lib/email";
import { sweepAssessmentInvites } from "@/lib/assessment-invites";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/cron/assessment-invites — standalone trigger for the prospect
// re-engagement sweep (also runs weekly inside the digest cron). CRON_SECRET
// protected. ?dryRun=1 lists who's due without sending.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return error("Unauthorized", 401);
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  if (!dryRun && !isEmailConfigured()) return error("Email not configured", 503);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await sweepAssessmentInvites(origin, dryRun);
  return json({ ok: true, dryRun, ...result });
}
