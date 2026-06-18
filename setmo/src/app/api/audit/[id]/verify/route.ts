import { prisma } from "@/lib/db";
import { isFreeEmailDomain, domainUsedRecently } from "@/lib/audit";
import { setAuditCookie } from "@/lib/audit-auth";
import { sendAuditApprovalRequest } from "@/lib/email";

// GET /api/audit/:id/verify?token= — confirm the prospect's email (and serve as
// the ongoing access link). Routes free-email / duplicate-domain audits to
// manual approval; otherwise activates the audit. Then sets the access cookie.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const audit = await prisma.setterAudit.findUnique({ where: { id } });
  if (!audit || audit.token !== token) {
    return Response.redirect(`${origin}/audit?error=invalid`, 302);
  }

  // First verification decides the approval path.
  if (!audit.emailVerified) {
    const free = isFreeEmailDomain(audit.emailDomain);
    const dup = await domainUsedRecently(audit.emailDomain, audit.id);
    const needsApproval = free || dup;

    await prisma.setterAudit.update({
      where: { id },
      data: {
        emailVerified: true,
        approved: !needsApproval,
        status: needsApproval ? "PENDING_APPROVAL" : "ACTIVE",
      },
    });

    if (needsApproval) {
      await sendAuditApprovalRequest({
        practiceName: audit.practiceName,
        email: audit.email,
        reason: free ? "Free / personal email domain" : "Practice already ran a free assessment in the last 2 months",
        manageLink: `${origin}/api/audit/${id}/verify?token=${token}`,
      });
    }
  }

  await setAuditCookie(id, token);
  return Response.redirect(`${origin}/audit/${id}`, 302);
}
