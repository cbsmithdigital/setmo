import { prisma } from "@/lib/db";
import { isFreeEmailDomain, isSetterLinkToken, loadAuditAccess } from "@/lib/audit";
import { setAuditCookie } from "@/lib/audit-auth";
import { sendAuditApprovalRequest } from "@/lib/email";
import { withinLimits, DAY } from "@/lib/rate-limit";

// GET /api/audit/:id/verify?token= — confirm the prospect's email (and serve as
// the ongoing access link). Free/personal-email audits route to manual review;
// otherwise the audit activates. Then sets the access cookie to the token the
// link carried. A setter link (from "send to your setter") can run the call and
// see the report; its browser never holds the owner's token, so it can't
// create the owner's account.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const audit = await prisma.setterAudit.findUnique({ where: { id } });
  const owner = Boolean(audit && token && audit.token === token);
  const setter = Boolean(audit && token && !owner && isSetterLinkToken(audit, token));
  if (!audit || (!owner && !setter)) {
    return Response.redirect(`${origin}/audit?error=invalid`, 302);
  }

  // First verification decides the approval path. A free/personal email domain
  // routes to manual review (some practices use personal emails for staff); the
  // per-email 30-day cooldown is enforced earlier, at audit creation. Only the
  // owner's own link verifies (a setter link is only ever sent once it has).
  if (owner && !audit.emailVerified) {
    const needsApproval = isFreeEmailDomain(audit.emailDomain);

    await prisma.setterAudit.update({
      where: { id },
      data: {
        emailVerified: true,
        approved: !needsApproval,
        status: needsApproval ? "PENDING_APPROVAL" : "ACTIVE",
      },
    });

    // A daily ceiling on review alerts, so a run of throwaway addresses can't bury
    // real mail; past it the assessment still waits in /platform/assessments.
    const alertCap = needsApproval
      ? await withinLimits([{ key: "audit-review-alert:all", limit: 50, windowSeconds: DAY }])
      : null;
    if (alertCap && !alertCap.ok) console.warn("[setmo:audit] review-alert cap reached; assessment queued without an email", id);
    if (alertCap?.ok) {
      await sendAuditApprovalRequest({
        practiceName: audit.practiceName,
        contactName: audit.contactName,
        email: audit.email,
        reason: "Personal email address",
        manageLink: `${origin}/platform/assessments/${id}`,
      });
    }
  }

  // A setter link doesn't replace the owner's own access on a browser that has it.
  const current = setter ? await loadAuditAccess(id) : null;
  if (!current || current.asSetter) await setAuditCookie(id, token);
  return Response.redirect(`${origin}/audit/${id}`, 302);
}
