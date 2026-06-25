import { prisma } from "@/lib/db";
import { isFreeEmailDomain } from "@/lib/audit";
import { setAuditCookie } from "@/lib/audit-auth";
import { sendAuditApprovalRequest } from "@/lib/email";

// GET /api/audit/:id/verify?token= — confirm the prospect's email (and serve as
// the ongoing access link). Free/personal-email audits route to manual review;
// otherwise the audit activates. Then sets the access cookie.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const audit = await prisma.setterAudit.findUnique({ where: { id } });
  if (!audit || audit.token !== token) {
    return Response.redirect(`${origin}/audit?error=invalid`, 302);
  }

  // First verification decides the approval path. A free/personal email domain
  // routes to manual review (some practices use personal emails for staff); the
  // per-email 30-day cooldown is enforced earlier, at audit creation.
  if (!audit.emailVerified) {
    const needsApproval = isFreeEmailDomain(audit.emailDomain);

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
        reason: "Personal / free email domain — prospect may request review",
        manageLink: `${origin}/api/audit/${id}/verify?token=${token}`,
      });
    }
  }

  await setAuditCookie(id, token);
  return Response.redirect(`${origin}/audit/${id}`, 302);
}
