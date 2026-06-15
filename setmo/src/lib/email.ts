import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

/**
 * Sends a setter invite email. Returns true if sent; false if email isn't
 * configured (caller can surface the link directly in dev).
 */
export async function sendInviteEmail(opts: {
  to: string;
  link: string;
  officeName: string;
  inviterName: string;
}): Promise<boolean> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) return false;

  await resend.emails.send({
    from,
    to: opts.to,
    subject: `You're invited to train with ${opts.officeName} on SetMo`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#7c3aed">Welcome to SetMo</h2>
        <p>${opts.inviterName} invited you to join <strong>${opts.officeName}</strong> and start
        practicing high-value lead calls.</p>
        <p style="margin:28px 0">
          <a href="${opts.link}" style="background:#7c3aed;color:#fff;padding:12px 22px;
          border-radius:12px;text-decoration:none;font-weight:600">Set up your account</a>
        </p>
        <p style="color:#64708a;font-size:13px">If the button doesn't work, paste this link:<br>${opts.link}</p>
      </div>
    `,
  });
  return true;
}

const ADMIN_EMAIL = process.env.SETMO_ADMIN_EMAIL || process.env.RESEND_FROM_EMAIL;

/** Verify-your-email link to unlock the Setter Audit report. */
export async function sendAuditVerifyEmail(opts: { to: string; link: string; practiceName: string }): Promise<boolean> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) return false;
  await resend.emails.send({
    from,
    to: opts.to,
    subject: "Confirm your free Setter Audit",
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#7c3aed">Your free Setter Audit for ${opts.practiceName}</h2>
        <p>Confirm your email to start your 5 calls and unlock the report.</p>
        <p style="margin:28px 0">
          <a href="${opts.link}" style="background:#7c3aed;color:#fff;padding:12px 22px;
          border-radius:12px;text-decoration:none;font-weight:600">Start my audit</a>
        </p>
        <p style="color:#64708a;font-size:13px">If the button doesn't work, paste this link:<br>${opts.link}</p>
      </div>
    `,
  });
  return true;
}

/** Notify the platform admin when an audit needs manual approval (free email / duplicate domain). */
export async function sendAuditApprovalRequest(opts: { practiceName: string; email: string; reason: string; manageLink: string }): Promise<boolean> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from || !ADMIN_EMAIL) return false;
  await resend.emails.send({
    from,
    to: ADMIN_EMAIL,
    subject: `SetMo audit needs approval — ${opts.practiceName}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#7c3aed">Setter Audit pending approval</h2>
        <p><strong>${opts.practiceName}</strong> (${opts.email}) requested a free audit.</p>
        <p><strong>Reason:</strong> ${opts.reason}</p>
        <p style="margin:24px 0"><a href="${opts.manageLink}" style="background:#7c3aed;color:#fff;padding:11px 20px;border-radius:12px;text-decoration:none;font-weight:600">Review &amp; approve</a></p>
      </div>
    `,
  });
  return true;
}

/** Share the audit access link with a setter the prospect wants to run the calls. */
export async function sendAuditSetterInvite(opts: { to: string; link: string; practiceName: string }): Promise<boolean> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) return false;
  await resend.emails.send({
    from,
    to: opts.to,
    subject: `Run ${opts.practiceName}'s SetMo Setter Audit`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#7c3aed">You've been asked to run a Setter Audit</h2>
        <p>${opts.practiceName} wants you to run 5 quick practice calls. Open the link and start whenever you're ready.</p>
        <p style="margin:28px 0"><a href="${opts.link}" style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600">Start the calls</a></p>
        <p style="color:#64708a;font-size:13px">If the button doesn't work, paste this link:<br>${opts.link}</p>
      </div>
    `,
  });
  return true;
}
