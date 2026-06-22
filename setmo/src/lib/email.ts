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

// Internal inboxes that receive sales / partner alerts. Override with
// SETMO_ALERT_EMAILS (comma-separated); defaults to the two monitored addresses.
const ALERT_EMAILS = (process.env.SETMO_ALERT_EMAILS || "hello@growdental.ai,adam@growdental.ai")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Escape user-supplied text before embedding it in alert HTML. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Notify the team when a new partner/affiliate application is submitted. */
export async function sendPartnerApplicationAlert(opts: {
  name: string;
  contactName: string;
  email: string;
  track: string;
  orgType?: string | null;
  audience?: string | null;
  manageLink: string;
}): Promise<boolean> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from || ALERT_EMAILS.length === 0) return false;
  const trackLabel = opts.track === "DISTRIBUTION" ? "Distribution" : "Referral";
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#64708a;vertical-align:top">${label}</td><td style="padding:4px 0;color:#1a1a2e"><strong>${esc(value)}</strong></td></tr>`;
  await resend.emails.send({
    from,
    to: ALERT_EMAILS,
    subject: `New SetMo partner application — ${opts.name} (${trackLabel})`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#7c3aed">New partner application</h2>
        <table style="font-size:14px;border-collapse:collapse;margin:8px 0 4px">
          ${row("Partner", opts.name)}
          ${row("Track", trackLabel)}
          ${row("Contact", opts.contactName)}
          ${row("Email", opts.email)}
          ${opts.orgType ? row("Org type", opts.orgType) : ""}
          ${opts.audience ? row("Audience", opts.audience) : ""}
        </table>
        <p style="margin:24px 0"><a href="${opts.manageLink}" style="background:#7c3aed;color:#fff;padding:11px 20px;border-radius:12px;text-decoration:none;font-weight:600">Review &amp; approve</a></p>
      </div>
    `,
  });
  return true;
}

/** Generic transactional send (weekly digests). Returns recipients actually sent to. */
export async function sendDigestEmail(opts: { to: string[]; subject: string; html: string }): Promise<number> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from || opts.to.length === 0) return 0;
  let sent = 0;
  for (const to of opts.to) {
    try {
      await resend.emails.send({ from, to, subject: opts.subject, html: opts.html });
      sent++;
    } catch {
      /* skip a bad address, keep going */
    }
  }
  return sent;
}

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

/** Invite a partner (or rep) to set up their SetMo partner-portal login. */
export async function sendPartnerInvite(opts: { to: string; link: string; partnerName: string; isRep?: boolean }): Promise<boolean> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) return false;
  await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.isRep ? `Join ${opts.partnerName} on the SetMo partner program` : `Your SetMo partner account is approved 🎉`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#7c3aed">${opts.isRep ? `You're on the ${opts.partnerName} partner team` : "Welcome to the SetMo partner program"}</h2>
        <p>${opts.isRep ? "Set up your login to get your referral link and track your earnings." : `${opts.partnerName} is approved. Set up your login to grab your referral link, track referred accounts, and see your earnings.`}</p>
        <p style="margin:28px 0"><a href="${opts.link}" style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600">Set up your partner login</a></p>
        <p style="color:#64708a;font-size:13px">If the button doesn't work, paste this link:<br>${opts.link}</p>
      </div>
    `,
  });
  return true;
}

/** Bimonthly re-engagement: invite a prospect to run another free assessment. */
export async function sendAssessmentInvite(opts: { to: string; practiceName: string; link: string }): Promise<boolean> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) return false;
  await resend.emails.send({
    from,
    to: opts.to,
    subject: `${opts.practiceName}: your next free Setter Assessment is ready`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#7c3aed">See how your setters are doing now</h2>
        <p>It's been a couple of months since ${opts.practiceName}'s last SetMo Setter Assessment. Run 5 quick calls and we'll score your team again — free — so you can see what's improved and where the booked-consult leaks still are.</p>
        <p style="margin:28px 0"><a href="${opts.link}" style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600">Start your free assessment</a></p>
        <p style="color:#64708a;font-size:13px">If the button doesn't work, paste this link:<br>${opts.link}</p>
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
