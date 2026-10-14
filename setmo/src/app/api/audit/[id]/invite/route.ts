import { z } from "zod";
import { loadAuditByCookie } from "@/lib/audit-auth";
import { sendAuditSetterInvite } from "@/lib/email";
import { error, json } from "@/lib/api";
import { clientIp, withinLimits, tooMany, HOUR, DAY } from "@/lib/rate-limit";
import { isBot, BOT_MESSAGE } from "@/lib/bot-check";

const Body = z.object({ email: z.string().email() });

// POST /api/audit/:id/invite — email the audit access link to a setter so they
// can run the calls. The link is the verify URL, which sets their access cookie.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (await isBot()) return error(BOT_MESSAGE, 403);
  const { id } = await params;
  const audit = await loadAuditByCookie(id);
  if (!audit) return error("Unauthorized", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Enter a valid email.", 422);

  // A handful per assessment is plenty; this mails whatever address it's given.
  const limit = await withinLimits([
    { key: `audit-invite:${id}`, limit: 5, windowSeconds: DAY },
    { key: `audit-invite:ip:${clientIp(req)}`, limit: 10, windowSeconds: HOUR },
  ]);
  if (!limit.ok) return tooMany(limit.retryAfter);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const link = `${origin}/api/audit/${id}/verify?token=${audit.token}`;
  const emailed = await sendAuditSetterInvite({ to: parsed.data.email, link, practiceName: audit.practiceName });
  return json({ emailed, link: emailed ? undefined : link });
}
