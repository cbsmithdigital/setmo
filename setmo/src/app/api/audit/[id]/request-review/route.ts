import { loadAuditByCookie } from "@/lib/audit-auth";
import { sendAuditApprovalRequest } from "@/lib/email";
import { error, json } from "@/lib/api";

// POST /api/audit/:id/request-review — a prospect on a personal email asks us to
// confirm their access by hand (some practices use personal emails for staff).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditByCookie(id);
  if (!audit) return error("Unauthorized", 401);
  if (audit.status !== "PENDING_APPROVAL") return json({ ok: true }); // nothing to do

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://setmo.growdental.ai";
  await sendAuditApprovalRequest({
    practiceName: audit.practiceName,
    email: audit.email,
    reason: "Prospect REQUESTED review — confirms this personal email is tied to their practice",
    manageLink: `${origin}/api/audit/${id}/verify?token=${audit.token}`,
  }).catch(() => {});
  return json({ ok: true });
}
