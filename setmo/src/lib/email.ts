import { Resend } from "resend";
import { captureError } from "@/lib/observability";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

/** Escape user-supplied text before embedding it in email HTML. Everything a
 *  visitor can type (practice, office, inviter, partner names, emails) goes
 *  through this, so a "name" can't carry a link or markup into our mail. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Subjects are plain text: no line breaks, bounded length. */
const subj = (s: string) => s.replace(/[\r\n]+/g, " ").slice(0, 180);

/**
 * The one place mail leaves. Resend reports failures in its return value rather
 * than throwing, so a send only counts when that value has no error. Resend
 * allows a couple of requests a second, so a rate-limited send waits and tries
 * again (a batch of invites would otherwise drop some). Other failures are
 * logged and reported, and the caller gets false so it can fall back (show the
 * link, say it didn't send). False also when email isn't configured.
 */
async function send(msg: { to: string | string[]; subject: string; html: string; headers?: Record<string, string> }, scope: string): Promise<boolean> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) return false;
  for (let attempt = 0; ; attempt++) {
    try {
      const { error } = await resend.emails.send({ from, to: msg.to, subject: subj(msg.subject), html: msg.html, ...(msg.headers ? { headers: msg.headers } : {}) });
      if (!error) return true;
      if (error.name === "rate_limit_exceeded" && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1100 * (attempt + 1)));
        continue;
      }
      captureError(new Error(`Email not sent: ${error.message}`), { scope: `email:${scope}`, name: error.name });
      return false;
    } catch (e) {
      captureError(e, { scope: `email:${scope}` });
      return false;
    }
  }
}

const button = (href: string, label: string) =>
  `<a href="${href}" style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600">${label}</a>`;
const pasteLink = (href: string) => `<p style="color:#64708a;font-size:13px">If the button doesn't work, paste this link:<br>${href}</p>`;
const wrap = (inner: string, width = 480) => `<div style="font-family:system-ui,sans-serif;max-width:${width}px;margin:0 auto;color:#1a1a2e">${inner}</div>`;

/** Sends a setter invite email (or, with `reminder`, a nudge about one that's
 *  still waiting). Returns false if it didn't go out (or email isn't
 *  configured) — the caller then shows the link directly. */
export async function sendInviteEmail(opts: { to: string; link: string; officeName: string; inviterName: string; reminder?: boolean }): Promise<boolean> {
  return send(
    {
      to: opts.to,
      subject: opts.reminder ? `Reminder: ${opts.officeName} invited you to SetMo` : `You're invited to train with ${opts.officeName} on SetMo`,
      html: wrap(
        opts.reminder
          ? `
        <h2 style="color:#7c3aed">Your SetMo invite is waiting</h2>
        <p>${esc(opts.inviterName)} invited you to join <strong>${esc(opts.officeName)}</strong> on SetMo, where your team practices
        real lead calls with an AI lead and gets scored and coached on every one. It takes a minute to set up.</p>
        <p style="margin:28px 0">${button(opts.link, "Set up your account")}</p>
        ${pasteLink(opts.link)}
      `
          : `
        <h2 style="color:#7c3aed">Welcome to SetMo</h2>
        <p>${esc(opts.inviterName)} invited you to join <strong>${esc(opts.officeName)}</strong> and start
        practicing high-value lead calls.</p>
        <p style="margin:28px 0">${button(opts.link, "Set up your account")}</p>
        ${pasteLink(opts.link)}
      `,
      ),
    },
    opts.reminder ? "invite-reminder" : "invite",
  );
}

/** Footer + one-click unsubscribe headers for the optional emails (weekly
 *  summaries, practice reminders) — the account and billing ones go regardless. */
const unsubscribeFooter = (url: string) =>
  `<p style="color:#94a3b8;font-size:12px;margin-top:28px">Don't want these emails? <a href="${url}" style="color:#94a3b8">Unsubscribe</a> — you'll still get account and billing emails.</p>`;

/** "Time for a practice call" — to a setter who hasn't practiced in a few days. */
export async function sendPracticeNudge(opts: {
  to: string;
  firstName: string | null;
  officeName: string;
  daysSince: number | null; // null = they haven't taken a practice call yet
  link: string;
  unsubscribeUrl: string;
  oneClickUrl: string;
}): Promise<boolean> {
  const hi = opts.firstName ? `Hi ${esc(opts.firstName)},` : "Hi,";
  const line =
    opts.daysSince == null
      ? `You haven't taken your first practice call with <strong>${esc(opts.officeName)}</strong> yet. It takes about five minutes: an AI lead calls in, you take the call, and you're scored on the spot with what to work on.`
      : `It's been ${opts.daysSince} days since your last practice call. A quick five-minute rep keeps your skills sharp for the real ones — and your next lead is ready.`;
  return send(
    {
      to: opts.to,
      subject: opts.daysSince == null ? "Your first SetMo practice call is ready" : "Time for a quick practice call?",
      html: wrap(`
        <h2 style="color:#7c3aed">Got five minutes?</h2>
        <p>${hi}</p>
        <p>${line}</p>
        <p style="margin:28px 0">${button(opts.link, "Start a practice call")}</p>
        ${unsubscribeFooter(opts.unsubscribeUrl)}
      `),
      headers: { "List-Unsubscribe": `<${opts.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    },
    "practice-nudge",
  );
}

export type PracticeUpdate = {
  name: string;
  calls: number;
  prevCalls: number;
  avg: number | null;
  setters: number;
  practiced: number;
  quiet: string[];
  pending: number;
  blocked: string | null; // why the practice can't take calls right now, if it can't
};

type GroupUpdateOpts = {
  to: string;
  orgName: string;
  periodDays: number;
  practices: PracticeUpdate[];
  link: string;
  unsubscribeUrl: string;
  oneClickUrl: string;
};

/** Every few days to a group/DSO admin: what each of their practices did (or
 *  didn't) in the period — the quiet ones first. */
export async function sendGroupUpdate(opts: GroupUpdateOpts): Promise<boolean> {
  const { subject, html } = buildGroupUpdate(opts);
  return send(
    { to: opts.to, subject, html, headers: { "List-Unsubscribe": `<${opts.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } },
    "group-update",
  );
}

/** The group update's subject and HTML (separate so it can be previewed). */
export function buildGroupUpdate(opts: GroupUpdateOpts): { subject: string; html: string } {
  const quietPractices = opts.practices.filter((p) => p.calls === 0);
  const active = opts.practices.filter((p) => p.calls > 0);
  const totalCalls = active.reduce((a, p) => a + p.calls, 0);
  const scored = active.filter((p) => p.avg != null);
  const avg = scored.length ? scored.reduce((a, p) => a + (p.avg ?? 0) * p.calls, 0) / scored.reduce((a, p) => a + p.calls, 0) : null;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const trend = (p: PracticeUpdate) =>
    p.prevCalls === p.calls ? "same as the 5 days before" : p.calls > p.prevCalls ? `up from ${p.prevCalls}` : `down from ${p.prevCalls}`;

  // Names to nudge, kept to a readable handful.
  const names = (list: string[]) => (list.length > 6 ? `${list.slice(0, 6).map(esc).join(", ")} and ${list.length - 6} more` : list.map(esc).join(", "));

  const practiceBlock = (p: PracticeUpdate) => {
    const lines: string[] = [];
    if (p.calls > 0) {
      lines.push(`${plural(p.calls, "practice call")} (${trend(p)}) · ${p.practiced} of ${plural(p.setters, "setter")} practiced${p.avg != null ? ` · average score ${p.avg.toFixed(1)}` : ""}`);
      if (p.quiet.length) lines.push(`Quiet: ${names(p.quiet)}`);
    } else if (p.blocked) {
      lines.push(esc(p.blocked));
    } else if (p.setters) {
      lines.push(`No practice calls${p.prevCalls ? ` (${p.prevCalls} the 5 days before)` : ""}`);
      lines.push(`Not practicing: ${names(p.quiet)}`);
    } else {
      lines.push("No setters on the team yet");
    }
    if (p.pending) lines.push(`${p.pending === 1 ? "1 person" : `${p.pending} people`} invited but not set up yet`);
    return `<div style="padding:10px 0;border-top:1px solid #e6e8f0"><strong>${esc(p.name)}</strong>${lines.map((l) => `<div style="font-size:14px;color:#3b4256;margin-top:3px">${l}</div>`).join("")}</div>`;
  };

  const summary = `${active.length} of ${plural(opts.practices.length, "practice")} practiced · ${plural(totalCalls, "call")}${avg != null ? ` · average score ${avg.toFixed(1)}` : ""}`;
  return {
      subject: `${opts.orgName}: your practices, the last ${opts.periodDays} days`,
      html: wrap(
        `
        <h2 style="color:#7c3aed">Your practices, the last ${opts.periodDays} days</h2>
        <p style="color:#3b4256">${summary}</p>
        ${quietPractices.length ? `<p style="margin:20px 0 4px;color:#b45309"><strong>Not practicing</strong></p>${quietPractices.map(practiceBlock).join("")}` : ""}
        ${active.length ? `<p style="margin:20px 0 4px;color:#047857"><strong>Practicing</strong></p>${active.map(practiceBlock).join("")}` : ""}
        <p style="margin:26px 0">${button(opts.link, "Open your portfolio")}</p>
        ${unsubscribeFooter(opts.unsubscribeUrl)}
      `,
        540,
      ),
  };
}

/** Weekly note to a practice's admins when the team hasn't practiced: who's
 *  gone quiet, and who never joined. */
export async function sendTeamIdleNudge(opts: {
  to: string;
  officeName: string;
  setters: { name: string; last: string }[];
  pending: { name: string }[];
  link: string;
  unsubscribeUrl: string;
  oneClickUrl: string;
}): Promise<boolean> {
  const row = (a: string, b: string) => `<tr><td style="padding:3px 16px 3px 0">${esc(a)}</td><td style="padding:3px 0;color:#64708a">${esc(b)}</td></tr>`;
  return send(
    {
      to: opts.to,
      subject: `${opts.officeName}: your team hasn't practiced this week`,
      html: wrap(
        `
        <h2 style="color:#7c3aed">No practice calls this week</h2>
        <p>Nobody at <strong>${esc(opts.officeName)}</strong> has taken a SetMo practice call in the last seven days. Teams that rep a couple of times a week book noticeably more consults — a quick nudge at your next huddle goes a long way.</p>
        ${opts.setters.length ? `<p style="margin:18px 0 6px"><strong>Your setters</strong></p><table style="font-size:14px;border-collapse:collapse">${opts.setters.map((s) => row(s.name, s.last)).join("")}</table>` : ""}
        ${opts.pending.length ? `<p style="margin:18px 0 6px"><strong>Invited but not set up yet</strong></p><p style="margin:0;font-size:14px">${opts.pending.map((p) => esc(p.name)).join(", ")} — you can resend their invite from your Team page.</p>` : ""}
        <p style="margin:26px 0">${button(opts.link, "Open your team")}</p>
        ${unsubscribeFooter(opts.unsubscribeUrl)}
      `,
        520,
      ),
      headers: { "List-Unsubscribe": `<${opts.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    },
    "team-idle-nudge",
  );
}

const ADMIN_EMAIL = process.env.SETMO_ADMIN_EMAIL || process.env.RESEND_FROM_EMAIL;

// Internal inboxes that receive sales / partner alerts. Override with
// SETMO_ALERT_EMAILS (comma-separated); defaults to the two monitored addresses.
const ALERT_EMAILS = (process.env.SETMO_ALERT_EMAILS || "hello@growdental.ai,adam@growdental.ai")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const alertRow = (label: string, value: string) =>
  `<tr><td style="padding:4px 14px 4px 0;color:#64708a;vertical-align:top">${label}</td><td style="padding:4px 0;color:#1a1a2e"><strong>${esc(value)}</strong></td></tr>`;

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
  if (ALERT_EMAILS.length === 0) return false;
  const trackLabel = opts.track === "DISTRIBUTION" ? "Distribution" : "Referral";
  return send(
    {
      to: ALERT_EMAILS,
      subject: `New SetMo partner application — ${opts.name} (${trackLabel})`,
      html: wrap(
        `
        <h2 style="color:#7c3aed">New partner application</h2>
        <table style="font-size:14px;border-collapse:collapse;margin:8px 0 4px">
          ${alertRow("Partner", opts.name)}
          ${alertRow("Track", trackLabel)}
          ${alertRow("Contact", opts.contactName)}
          ${alertRow("Email", opts.email)}
          ${opts.orgType ? alertRow("Org type", opts.orgType) : ""}
          ${opts.audience ? alertRow("Audience", opts.audience) : ""}
        </table>
        <p style="margin:24px 0">${button(opts.manageLink, "Review &amp; approve")}</p>
      `,
        540,
      ),
    },
    "partner-application",
  );
}

/** An account asked for gift-card rewards — the super admin turns them on from
 *  the account's page in the platform console. */
export async function sendGiftCardRequestAlert(opts: { accountName: string; requester: string; requesterEmail: string; manageLink: string }): Promise<boolean> {
  if (ALERT_EMAILS.length === 0) return false;
  return send(
    {
      to: ALERT_EMAILS,
      subject: `Gift card request — ${opts.accountName}`,
      html: wrap(
        `
        <h2 style="color:#7c3aed">An account wants gift-card rewards</h2>
        <table style="font-size:14px;border-collapse:collapse;margin:8px 0 4px">
          ${alertRow("Account", opts.accountName)}
          ${alertRow("Asked by", opts.requester)}
          ${alertRow("Email", opts.requesterEmail)}
        </table>
        <p>Gift cards go out through Tremendous and are paid from SetMo's balance. Turn them on from the account's page if you're happy to.</p>
        <p style="margin:24px 0">${button(opts.manageLink, "Open the account")}</p>
      `,
        540,
      ),
    },
    "gift-card-request",
  );
}

// Sends one digest to one recipient. `unsubscribeUrl` (RFC 8058) enables Gmail's
// one-click unsubscribe and is also linked in the email footer. Returns 1 when sent.
export async function sendDigestEmail(opts: { to: string; subject: string; html: string; unsubscribeUrl?: string }): Promise<number> {
  if (!opts.to) return 0;
  const ok = await send(
    {
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${opts.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    },
    "digest",
  );
  return ok ? 1 : 0;
}

/** Verify-your-email link to unlock the Setter Audit report. */
export async function sendAuditVerifyEmail(opts: { to: string; link: string; practiceName: string }): Promise<boolean> {
  return send(
    {
      to: opts.to,
      subject: "Confirm your free Setter Audit",
      html: wrap(`
        <h2 style="color:#7c3aed">Your free Setter Audit for ${esc(opts.practiceName)}</h2>
        <p>Confirm your email to start your call and unlock the report.</p>
        <p style="margin:28px 0">${button(opts.link, "Start my audit")}</p>
        ${pasteLink(opts.link)}
      `),
    },
    "audit-verify",
  );
}

/** Low-minute-balance alert for office admins (fires at 100 and 60 minutes). */
export async function sendMinuteLowEmail(opts: { to: string[]; practiceName: string; remaining: number; autoTopUp: boolean; topUpMinutes: number; threshold: number }): Promise<number> {
  if (opts.to.length === 0) return 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://setmo.growdental.ai";
  const billing = `${appUrl}/office/billing`;

  const remainingTokens = opts.remaining * 10;
  const topUpTokens = opts.topUpMinutes * 10;
  const autoLine = opts.autoTopUp
    ? `It's set to <strong>auto-purchase ${topUpTokens.toLocaleString()} tokens</strong> when your balance dips below 250, so your team won't be interrupted. If you'd rather not auto-purchase, you can turn it off in Billing before then.`
    : `Auto top-up is currently <strong>off</strong>, so calls will pause when the balance runs out. Add tokens — or switch on auto top-up — in Billing to keep your team going.`;

  let sent = 0;
  for (const to of opts.to) {
    const ok = await send(
      {
        to,
        subject: `${opts.practiceName}: your SetMo tokens are running low (${remainingTokens.toLocaleString()} left)`,
        html: wrap(`
          <h2 style="color:#7c3aed">Your token balance is low</h2>
          <p>It looks like your team has been using SetMo more, and your token balance is low — about <strong>${remainingTokens.toLocaleString()} tokens</strong> remaining for ${esc(opts.practiceName)}.</p>
          <p>${autoLine}</p>
          <p style="margin:26px 0">${button(billing, "Manage tokens &amp; auto top-up")}</p>
          <p style="color:#64708a;font-size:13px">Assessments are always free and never use your tokens.</p>
        `),
      },
      "minute-low",
    );
    if (ok) sent++;
  }
  return sent;
}

/** A demo account is running low — tells the SetMo team to top it up. Demo
 *  accounts can't buy anything, so this goes to platform admins, not the demo's
 *  own users, and points at the platform console instead of Billing. */
export async function sendDemoMinuteLowEmail(opts: { to: string[]; practiceName: string; officeId: string; remaining: number }): Promise<number> {
  if (opts.to.length === 0) return 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://setmo.growdental.ai";
  const console_ = `${appUrl}/platform/accounts`;
  const remaining = Math.max(0, opts.remaining);

  let sent = 0;
  for (const to of opts.to) {
    const ok = await send(
      {
        to,
        subject: `Demo account low: ${opts.practiceName} has ${remaining} minutes left`,
        html: wrap(`
          <h2 style="color:#7c3aed">A demo account needs minutes</h2>
          <p><strong>${esc(opts.practiceName)}</strong> is a demo account and is down to <strong>${remaining} minutes</strong>${opts.remaining < 0 ? " (it's overdrawn)" : ""}. Demo calls stop once it runs out.</p>
          <p style="margin:26px 0">${button(console_, "Open accounts to add minutes")}</p>
          <p style="color:#64708a;font-size:13px">Demo usage is real voice-agent spend but isn't counted in revenue or platform metrics.</p>
        `),
      },
      "demo-minute-low",
    );
    if (ok) sent++;
  }
  return sent;
}

/** Group/DSO Setty Advisor wallet is low — prompt the leader to add a card / buy more. */
export async function sendGroupCoachLowEmail(opts: { to: string[]; orgName: string; remaining: number }): Promise<number> {
  if (opts.to.length === 0) return 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://setmo.growdental.ai";
  const billing = `${appUrl}/group/billing`;
  const remainingTokens = Math.max(0, opts.remaining) * 10;

  let sent = 0;
  for (const to of opts.to) {
    const ok = await send(
      {
        to,
        subject: `${opts.orgName}: your Setty Advisor tokens are running low (${remainingTokens.toLocaleString()} left)`,
        html: wrap(`
          <h2 style="color:#7c3aed">Your Setty Advisor balance is low</h2>
          <p>You have about <strong>${remainingTokens.toLocaleString()} tokens</strong> (~${Math.max(0, opts.remaining)} min) left for ${esc(opts.orgName)} this month.</p>
          <p>Add a card and top up to keep your strategy sessions going — group/DSO tokens are <strong>50% off</strong>. Your free monthly allowance refreshes at the start of next month.</p>
          <p style="margin:26px 0">${button(billing, "Add a card &amp; buy tokens")}</p>
        `),
      },
      "group-coach-low",
    );
    if (ok) sent++;
  }
  return sent;
}

/** Password reset link (server-generated recovery, sent via Resend). */
export async function sendPasswordResetEmail(opts: { to: string; link: string }): Promise<boolean> {
  return send(
    {
      to: opts.to,
      subject: "Reset your SetMo password",
      html: wrap(`
        <h2 style="color:#7c3aed">Reset your password</h2>
        <p>Click below to choose a new password. If you didn't request this, you can ignore this email.</p>
        <p style="margin:28px 0">${button(opts.link, "Set a new password")}</p>
        ${pasteLink(opts.link)}
      `),
    },
    "password-reset",
  );
}

/** Notify the platform admin when an audit needs manual approval (free email / duplicate domain). */
export async function sendAuditApprovalRequest(opts: { practiceName: string; email: string; reason: string; manageLink: string }): Promise<boolean> {
  if (!ADMIN_EMAIL) return false;
  return send(
    {
      to: ADMIN_EMAIL,
      subject: `SetMo audit needs approval — ${opts.practiceName}`,
      html: wrap(
        `
        <h2 style="color:#7c3aed">Setter Audit pending approval</h2>
        <p><strong>${esc(opts.practiceName)}</strong> (${esc(opts.email)}) requested a free audit.</p>
        <p><strong>Reason:</strong> ${esc(opts.reason)}</p>
        <p style="margin:24px 0">${button(opts.manageLink, "Review &amp; approve")}</p>
      `,
        520,
      ),
    },
    "audit-approval",
  );
}

/** Invite a partner (or rep) to set up their SetMo partner-portal login. */
export async function sendPartnerInvite(opts: { to: string; link: string; partnerName: string; isRep?: boolean; trackingOnly?: boolean }): Promise<boolean> {
  const partner = esc(opts.partnerName);
  // A tracking-only partner has no commission deal yet, so nothing mentions earnings.
  const repBody = opts.trackingOnly
    ? "Set up your login to get your own tracking link, see the practices you've brought in, and practise with the SetMo demo account."
    : "Set up your login to get your referral link and track your earnings.";
  const adminBody = opts.trackingOnly
    ? `Set up your login to get ${partner}'s tracking link, see every practice you refer, add your sales reps, and explore SetMo in your own demo account.`
    : `${partner} is approved. Set up your login to grab your referral link, track referred accounts, and see your earnings.`;
  return send(
    {
      to: opts.to,
      subject: opts.isRep ? `Join ${opts.partnerName} on SetMo` : opts.trackingOnly ? `Your SetMo partner login for ${opts.partnerName}` : `Your SetMo partner account is approved 🎉`,
      html: wrap(`
        <h2 style="color:#7c3aed">${opts.isRep ? `You're on the ${partner} team` : "Welcome to the SetMo partner program"}</h2>
        <p>${opts.isRep ? repBody : adminBody}</p>
        <p style="margin:28px 0">${button(opts.link, "Set up your partner login")}</p>
        ${pasteLink(opts.link)}
      `),
    },
    "partner-invite",
  );
}

/** Bimonthly re-engagement: invite a prospect to run another free assessment. */
export async function sendAssessmentInvite(opts: { to: string; practiceName: string; link: string }): Promise<boolean> {
  return send(
    {
      to: opts.to,
      subject: `${opts.practiceName}: your next free Setter Assessment is ready`,
      html: wrap(`
        <h2 style="color:#7c3aed">See how your setters are doing now</h2>
        <p>It's been a couple of months since ${esc(opts.practiceName)}'s last SetMo Setter Assessment. Run one quick practice call and we'll score it again — free — so you can see what's improved and where the booked-consult leaks still are.</p>
        <p style="margin:28px 0">${button(opts.link, "Start your free assessment")}</p>
        ${pasteLink(opts.link)}
      `),
    },
    "assessment-invite",
  );
}

/** Share the audit access link with a setter the prospect wants to run the call. */
export async function sendAuditSetterInvite(opts: { to: string; link: string; practiceName: string }): Promise<boolean> {
  return send(
    {
      to: opts.to,
      subject: `Run ${opts.practiceName}'s SetMo Setter Audit`,
      html: wrap(`
        <h2 style="color:#7c3aed">You've been asked to run a Setter Audit</h2>
        <p>${esc(opts.practiceName)} wants you to run one quick practice call. Open the link and start whenever you're ready.</p>
        <p style="margin:28px 0">${button(opts.link, "Start the call")}</p>
        ${pasteLink(opts.link)}
      `),
    },
    "audit-setter-invite",
  );
}

/** Money events the team should know about (refunds, disputes): what happened
 *  and what SetMo did about it. Lines are plain text. */
export async function sendBillingAlert(opts: { subject: string; heading: string; lines: string[] }): Promise<boolean> {
  if (ALERT_EMAILS.length === 0) return false;
  return send(
    {
      to: ALERT_EMAILS,
      subject: opts.subject,
      html: wrap(
        `
        <h2 style="color:#7c3aed">${esc(opts.heading)}</h2>
        ${opts.lines.map((l) => `<p>${esc(l)}</p>`).join("\n")}
      `,
        540,
      ),
    },
    "billing-alert",
  );
}
