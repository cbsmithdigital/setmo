import { z } from "zod";
import { loadAuditAccess, setterLinkToken } from "@/lib/audit";
import { sendAuditSetterInvite } from "@/lib/email";
import { error, json } from "@/lib/api";
import { clientIp, withinLimits, tooMany, HOUR, DAY } from "@/lib/rate-limit";
import { isBot, BOT_MESSAGE } from "@/lib/bot-check";

const Body = z.object({ email: z.string().email() });

// POST /api/audit/:id/invite — email the audit access link to a setter so they
// can run the call. It's a setter link: the verify URL with a token that runs
// the call and opens the report but can't create the owner's account. Sent to
// the audit's own address, it's the owner's link (that inbox is theirs).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (await isBot()) return error(BOT_MESSAGE, 403);
  const { id } = await params;
  const audit = await loadAuditAccess(id);
  if (!audit) return error("Unauthorized", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Enter a valid email.", 422);

  // A handful per assessment is plenty; this mails whatever address it's given.
  const limit = await withinLimits([
    { key: `audit-invite:${id}`, limit: 5, windowSeconds: DAY },
    { key: `audit-invite:ip:${clientIp(req)}`, limit: 10, windowSeconds: HOUR },
  ]);
  if (!limit.ok) return tooMany(limit.retryAfter);

  const to = parsed.data.email.trim().toLowerCase();
  const toOwner = to === audit.email;
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const link = `${origin}/api/audit/${id}/verify?token=${toOwner ? audit.token : setterLinkToken(audit)}`;
  const emailed = await sendAuditSetterInvite({ to, link, practiceName: audit.practiceName });
  // The owner's own link only ever travels by email; a setter link can be
  // handed over here when the email didn't go out.
  return json({ emailed, link: emailed || toOwner ? undefined : link });
}
