import { prisma } from "@/lib/db";
import { getPlatformActor, isSuperAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { isFreeEmailDomain } from "@/lib/audit";
import { sendAuditVerifyEmail } from "@/lib/email";
import { captureError } from "@/lib/observability";
import { error, json } from "@/lib/api";

// POST /api/audit/:id/approve — a super admin approves a free assessment held
// for review (a personal email address). It activates exactly as a work-email
// verification does, then emails the prospect their link. A POST from the
// platform console, so following the alert email's link never approves anything.
// With { resend: true }, emails the link again to a live assessment that has no
// report yet (say the first email never arrived).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getPlatformActor();
  if (!actor || !isSuperAdmin(actor.role)) return error("Only a SetMo super admin can approve assessments.", 403);
  const { id } = await params;
  const resend = ((await req.json().catch(() => null)) as { resend?: unknown } | null)?.resend === true;

  const audit = await prisma.setterAudit.findUnique({ where: { id }, select: { status: true, token: true, email: true, emailDomain: true, practiceName: true } });
  if (!audit) return error("Assessment not found", 404);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const link = `${origin}/api/audit/${id}/verify?token=${audit.token}`;

  if (resend) {
    if (audit.status !== "ACTIVE") return error("Only a live assessment without a report can be sent its link again.", 409);
    // A personal address only goes live once it's approved here.
    const kind = isFreeEmailDomain(audit.emailDomain) ? "approved" : "resent";
    const emailed = await sendAuditVerifyEmail({ to: audit.email, link, practiceName: audit.practiceName, kind });
    return json({ ok: true, status: audit.status, emailed, link: emailed ? undefined : link });
  }

  // Only one waiting for review moves; a second click (or another admin) is a no-op.
  const moved = await prisma.setterAudit.updateMany({
    where: { id, status: "PENDING_APPROVAL" },
    data: { emailVerified: true, approved: true, status: "ACTIVE" },
  });
  if (moved.count === 0) return json({ ok: true, status: audit.status, already: true });

  // The prospect is waiting on this email, so it goes first; the log line never holds it up.
  const emailed = await sendAuditVerifyEmail({ to: audit.email, link, practiceName: audit.practiceName, kind: "approved" });
  await logAdminAction(actor, {
    action: "assessment.approve",
    summary: `Approved the free assessment for ${audit.practiceName} (${audit.email})`,
    targetType: "setter_audit",
    targetId: id,
  }).catch((e) => captureError(e, { scope: "assessment-approve-log", auditId: id }));
  // If the email didn't go out, the admin gets the link to send by hand.
  return json({ ok: true, status: "ACTIVE", emailed, link: emailed ? undefined : link });
}
