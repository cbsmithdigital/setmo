import { z } from "zod";
import { loadAuditByCookie } from "@/lib/audit-auth";
import { sendAuditSetterInvite } from "@/lib/email";
import { error, json } from "@/lib/api";

const Body = z.object({ email: z.string().email() });

// POST /api/audit/:id/invite — email the audit access link to a setter so they
// can run the calls. The link is the verify URL, which sets their access cookie.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditByCookie(id);
  if (!audit) return error("Unauthorized", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Enter a valid email.", 422);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const link = `${origin}/api/audit/${id}/verify?token=${audit.token}`;
  const emailed = await sendAuditSetterInvite({ to: parsed.data.email, link, practiceName: audit.practiceName });
  return json({ emailed, link: emailed ? undefined : link });
}
