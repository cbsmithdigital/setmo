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
