import { prisma } from "@/lib/db";
import { pushToUsers } from "@/lib/push";
import { practiceBlockedMessage, canStartCallCenter, callCenterOrgForAgent, officeAdmins } from "@/lib/usage";
import { isEmailConfigured, sendPracticeNudge, sendTeamIdleNudge } from "@/lib/email";
import { resendInvite } from "@/lib/invites";
import { unsubscribeToken, unsubscribeUrl } from "@/lib/unsubscribe";
import { fullName } from "@/lib/format";
import { captureError } from "@/lib/observability";

// Adoption nudges, run weekday mornings by /api/cron/nudges:
//  - setters: anyone designated a setter who hasn't taken a practice call in 3
//    days gets a nudge (email, plus a phone notification if they turned those
//    on) — and again every 3 days while they stay quiet (Adam, 2026-10-14);
//  - invites: a reminder on day 2 and day 7 to anyone who hasn't set up their
//    account, with a fresh link;
//  - admins: a weekly note when nobody at the practice has practiced in 7 days.
// Never for demo accounts, or where the practice can't take a call right now
// (no Practice Access, or out of tokens — the billing emails cover that). The
// optional emails carry an unsubscribe link (User.digestOptOut).

const DAY = 86_400_000;
const SETTER_QUIET_DAYS = 3;
const TEAM_QUIET_DAYS = 7;
const INVITE_REMINDER_AGES = [2, 7]; // days after the invite
const INVITE_REMINDER_GAP_DAYS = 4; // at least this long between the two

type RunOpts = { origin: string; dryRun?: boolean };

const PUSHES = [
  { title: "Got 5 minutes?", body: "A quick practice call keeps your skills sharp — a new lead is ready when you are." },
  { title: "Your next lead is waiting", body: "One short practice call today makes the real ones easier. Tap to start." },
  { title: "Time for a rep?", body: "Pick a call type and a lead, and get scored in minutes." },
];

const oneClick = (origin: string, userId: string) => `${origin}/api/digest/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
const ago = (d: Date) => {
  const days = Math.floor((Date.now() - d.getTime()) / DAY);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

/** Setters with no practice call in 3 days — nudged, then every 3 days while quiet. */
export async function nudgeQuietSetters({ origin, dryRun }: RunOpts) {
  const now = Date.now();
  const cutoff = new Date(now - SETTER_QUIET_DAYS * DAY);
  const candidates = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      createdAt: { lt: cutoff },
      OR: [{ role: "SETTER" }, { memberships: { some: { role: "SETTER" } } }],
      AND: [{ OR: [{ practiceReminderAt: null }, { practiceReminderAt: { lt: cutoff } }] }],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      role: true,
      officeId: true,
      callCenterPodId: true,
      digestOptOut: true,
      memberships: { select: { role: true, scopeId: true } },
      office: { select: { name: true, isDemo: true, organization: { select: { isDemo: true } } } },
      pushSubscriptions: { select: { id: true }, take: 1 },
    },
  });

  const openOffice = new Map<string, boolean>();
  const openCenter = new Map<string, { ok: boolean; name: string }>();
  const plan: { email: string; office: string; daysSince: number | null; channels: string[] }[] = [];
  let sent = 0;

  for (const u of candidates) {
    // Designated a setter: primary role, or a setter hat in their own office.
    const isSetter = u.role === "SETTER" || u.memberships.some((m) => m.role === "SETTER" && m.scopeId === u.officeId);
    if (!isSetter) continue;

    // Somewhere they can actually practice right now.
    let placeName: string;
    if (u.callCenterPodId) {
      const orgId = await callCenterOrgForAgent(u.id);
      if (!orgId) continue;
      if (!openCenter.has(orgId)) {
        const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, isDemo: true } });
        openCenter.set(orgId, { ok: Boolean(org && !org.isDemo && (await canStartCallCenter(orgId)).ok), name: org?.name ?? "your call center" });
      }
      const c = openCenter.get(orgId)!;
      if (!c.ok) continue;
      placeName = c.name;
    } else {
      if (!u.officeId || !u.office || u.office.isDemo || u.office.organization?.isDemo) continue;
      if (!openOffice.has(u.officeId)) openOffice.set(u.officeId, (await practiceBlockedMessage(u.officeId)) === null);
      if (!openOffice.get(u.officeId)) continue;
      placeName = u.office.name;
    }

    const last = await prisma.session.findFirst({
      where: { setterId: u.id, kind: "PRACTICE", isAudit: false },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    if (last && last.startedAt > cutoff) continue; // practiced recently
    const daysSince = last ? Math.floor((now - last.startedAt.getTime()) / DAY) : null;

    const channels: string[] = [];
    // (A dry run lists email even where it isn't configured — e.g. a local preview.)
    if (!u.digestOptOut && (dryRun || isEmailConfigured())) channels.push("email");
    if (u.pushSubscriptions.length) channels.push("push");
    if (!channels.length) continue;
    plan.push({ email: u.email, office: placeName, daysSince, channels });
    if (dryRun) continue;

    let reached = false;
    try {
      if (channels.includes("email")) {
        reached =
          (await sendPracticeNudge({
            to: u.email,
            firstName: u.firstName,
            officeName: placeName,
            daysSince,
            link: `${origin}/practice`,
            unsubscribeUrl: unsubscribeUrl(u.id),
            oneClickUrl: oneClick(origin, u.id),
          })) || reached;
      }
      if (channels.includes("push")) {
        const push = PUSHES[Math.floor(now / DAY) % PUSHES.length];
        const r = await pushToUsers([u.id], { ...push, url: "/practice", tag: "practice-reminder" }, { ttlSeconds: 6 * 60 * 60 });
        reached = r.sent > 0 || reached;
      }
    } catch (e) {
      captureError(e, { scope: "nudge-setter", userId: u.id });
    }
    if (reached) {
      sent++;
      await prisma.user.update({ where: { id: u.id }, data: { practiceReminderAt: new Date() } });
    }
  }
  return { considered: candidates.length, nudged: dryRun ? plan.length : sent, plan };
}

/** Invited people who haven't set up their account: a reminder on day 2 and day 7. */
export async function remindPendingInvites({ origin, dryRun }: RunOpts) {
  const now = Date.now();
  const invited = await prisma.user.findMany({
    where: {
      status: "INVITED",
      inviteRemindersSent: { lt: INVITE_REMINDER_AGES.length },
      createdAt: { lt: new Date(now - INVITE_REMINDER_AGES[0] * DAY) },
      NOT: { email: { endsWith: "@prospect.setmo" } }, // assessment stand-ins, not people
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
      inviteRemindersSent: true,
      inviteRemindedAt: true,
      invitedById: true,
      officeId: true,
      organizationId: true,
      office: { select: { name: true, isDemo: true, isProspect: true } },
      organization: { select: { name: true, isDemo: true } },
    },
  });

  const plan: { email: string; to: string; reminder: number }[] = [];
  let sent = 0;
  for (const u of invited) {
    // Only invites into a real practice, group or call center.
    if (!u.officeId && !u.organizationId) continue;
    if (u.office?.isDemo || u.office?.isProspect || u.organization?.isDemo) continue;
    const age = now - u.createdAt.getTime();
    const n = u.inviteRemindersSent;
    const due =
      age >= INVITE_REMINDER_AGES[n] * DAY &&
      (!u.inviteRemindedAt || now - u.inviteRemindedAt.getTime() >= INVITE_REMINDER_GAP_DAYS * DAY);
    if (!due) continue;
    const to = u.office?.name ?? u.organization?.name ?? "your practice";
    plan.push({ email: u.email, to, reminder: n + 1 });
    if (dryRun) continue;

    const inviter = u.invitedById ? await prisma.user.findUnique({ where: { id: u.invitedById }, select: { firstName: true, lastName: true } }) : null;
    try {
      const r = await resendInvite({ email: u.email, contextName: to, inviterName: fullName(inviter?.firstName, inviter?.lastName) || `The ${to} team`, origin, reminder: true });
      if (r.ok && !r.previewLink) sent++;
    } catch (e) {
      captureError(e, { scope: "nudge-invite", userId: u.id });
    }
    // Counted either way, so a link that can't be made (the person already set
    // up some other way) isn't retried every morning.
    await prisma.user.update({ where: { id: u.id }, data: { inviteRemindersSent: n + 1, inviteRemindedAt: new Date() } });
  }
  return { considered: invited.length, reminded: dryRun ? plan.length : sent, plan };
}

/** Practices where nobody has practiced in 7 days: a weekly note to the admins. */
export async function nudgeQuietTeams({ origin, dryRun }: RunOpts) {
  const now = Date.now();
  const since = new Date(now - TEAM_QUIET_DAYS * DAY);
  const offices = await prisma.office.findMany({
    where: {
      isDemo: false,
      isProspect: false,
      createdAt: { lt: since },
      OR: [{ idleNudgeAt: null }, { idleNudgeAt: { lt: since } }],
    },
    select: { id: true, name: true, organization: { select: { isDemo: true } } },
  });

  const plan: { office: string; admins: string[]; setters: number; pending: number }[] = [];
  let sent = 0;
  for (const o of offices) {
    if (o.organization?.isDemo) continue;
    if ((await practiceBlockedMessage(o.id)) !== null) continue; // can't practice — billing emails cover it
    const practiced = await prisma.session.count({ where: { officeId: o.id, kind: "PRACTICE", isAudit: false, startedAt: { gte: since } } });
    if (practiced > 0) continue;

    const [setters, pending, adminRows] = await Promise.all([
      prisma.user.findMany({
        where: { officeId: o.id, status: "ACTIVE", OR: [{ role: "SETTER" }, { memberships: { some: { role: "SETTER", scopeId: o.id } } }] },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      prisma.user.findMany({
        where: { officeId: o.id, status: "INVITED", NOT: { email: { endsWith: "@prospect.setmo" } } },
        select: { firstName: true, lastName: true, email: true },
      }),
      officeAdmins(o.id),
    ]);
    if (!setters.length && !pending.length) continue;
    const admins = await prisma.user.findMany({ where: { id: { in: adminRows.map((a) => a.id) }, digestOptOut: false }, select: { id: true, email: true } });
    if (!admins.length) continue;

    const setterRows = await Promise.all(
      setters.map(async (s) => {
        const last = await prisma.session.findFirst({ where: { setterId: s.id, kind: "PRACTICE", isAudit: false }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
        return { name: fullName(s.firstName, s.lastName) || s.email, last: last ? `last practiced ${ago(last.startedAt)}` : "hasn't practiced yet" };
      })
    );
    plan.push({ office: o.name, admins: admins.map((a) => a.email), setters: setters.length, pending: pending.length });
    if (dryRun) continue;

    let any = false;
    for (const a of admins) {
      const ok = await sendTeamIdleNudge({
        to: a.email,
        officeName: o.name,
        setters: setterRows,
        pending: pending.map((p) => ({ name: fullName(p.firstName, p.lastName) || p.email })),
        link: `${origin}/office/team`,
        unsubscribeUrl: unsubscribeUrl(a.id),
        oneClickUrl: oneClick(origin, a.id),
      }).catch(() => false);
      any = ok || any;
    }
    if (any) {
      sent++;
      await prisma.office.update({ where: { id: o.id }, data: { idleNudgeAt: new Date() } });
    }
  }
  return { considered: offices.length, nudged: dryRun ? plan.length : sent, plan };
}
