import { prisma } from "@/lib/db";

// ===========================================================================
// FREE TRIALS — for accounts SetMo staff set up on Platform (New account). A
// trial turns Practice Access on for 14 days (a practice's own trial, or its
// group's, which covers every location) and comes with a complimentary hour
// of practice calls (600 tokens). After it ends, calls stop until the account
// activates from Billing: Practice Access plus a token balance, standard
// pricing. Unused complimentary tokens stay on the balance.
//
// usage.ts reads the trial for access (accessState); the nudges cron sends the
// "ends in 3 days" and "has ended" emails (sendTrialNotices).
// ===========================================================================

export const TRIAL_DAYS = 14;
/** The complimentary hour. Tokens = minutes × 10. */
export const TRIAL_MINUTES = 60;
const DAY = 86_400_000;
// The "ends soon" email goes this many days before the end.
const SOON_DAYS = 3;

/** The comp bundle's reference — one per location, ever (the column is unique). */
export const trialRef = (officeId: string) => `trial:${officeId}`;

/** The trial that applies to a location: its own, else its group's. */
export function trialEndFor(o: { trialEndsAt: Date | null; organization?: { trialEndsAt: Date | null } | null }): Date | null {
  return o.trialEndsAt ?? o.organization?.trialEndsAt ?? null;
}

/** A new trial's end: TRIAL_DAYS from now. */
export const newTrialEnd = (from = Date.now()) => new Date(from + TRIAL_DAYS * DAY);

/** The trial end as people read it, e.g. "Tue, Nov 18" (US Mountain time). */
export function trialDateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Denver" });
}

/** A trial's state right now, for pages: the date, days left, and whether it's over. */
export function trialStatus(endsAt: Date): { label: string; daysLeft: number; ended: boolean } {
  const ms = endsAt.getTime() - Date.now();
  return { label: trialDateLabel(endsAt), daysLeft: Math.max(0, Math.ceil(ms / DAY)), ended: ms <= 0 };
}

/** Grant the complimentary hour to a location — once, ever. */
export async function grantTrialHour(officeId: string): Promise<boolean> {
  try {
    await prisma.conversationBundle.create({
      data: { officeId, minutesPurchased: TRIAL_MINUTES, minutesRemaining: TRIAL_MINUTES, hours: 1, amountCents: 0, stripePaymentIntent: trialRef(officeId) },
    });
    return true;
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return false; // already granted
    throw e;
  }
}

export type TrialInfo = { endsAt: Date; label: string; daysLeft: number; ended: boolean; activated: boolean };

/** A location's trial, or null when it never had one. */
export async function getTrialInfo(officeId: string): Promise<TrialInfo | null> {
  const o = await prisma.office.findUnique({
    where: { id: officeId },
    select: { trialEndsAt: true, organization: { select: { trialEndsAt: true } }, subscription: { select: { status: true } } },
  });
  if (!o) return null;
  const endsAt = trialEndFor(o);
  if (!endsAt) return null;
  const ms = endsAt.getTime() - Date.now();
  return {
    endsAt,
    label: trialDateLabel(endsAt),
    daysLeft: Math.max(0, Math.ceil(ms / DAY)),
    ended: ms <= 0,
    activated: o.subscription?.status === "ACTIVE" || o.subscription?.status === "PAST_DUE",
  };
}

const unique = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter((x): x is string => Boolean(x))));

/**
 * The nudges cron (weekday mornings): email the account's admins once when the
 * trial has 3 days or less to go, and once when it has ended — unless they've
 * already activated. Nothing is sent to an account whose owner hasn't set up
 * their login yet (they get the invite reminders instead). ?dryRun lists it.
 */
export async function sendTrialNotices({ origin, dryRun }: { origin: string; dryRun?: boolean }) {
  const now = Date.now();
  const soon = new Date(now + SOON_DAYS * DAY);
  const { sendTrialNoticeEmail } = await import("@/lib/email");
  const plan: { account: string; to: string[]; notice: "soon" | "ended" }[] = [];
  let sent = 0;

  // Single practices (their own trial).
  const offices = await prisma.office.findMany({
    where: { trialEndsAt: { not: null, lte: soon }, trialNoticeStage: { lt: 2 }, isDemo: false, isProspect: false },
    select: { id: true, name: true, trialEndsAt: true, trialNoticeStage: true, subscription: { select: { status: true } } },
  });
  for (const o of offices) {
    if (o.subscription?.status === "ACTIVE" || o.subscription?.status === "PAST_DUE") continue;
    const ended = o.trialEndsAt!.getTime() <= now;
    const stage = ended ? 2 : 1;
    if (o.trialNoticeStage >= stage) continue;
    const admins = await prisma.user.findMany({
      where: { status: "ACTIVE", officeId: o.id, OR: [{ role: "OFFICE_ADMIN" }, { memberships: { some: { role: "OFFICE_ADMIN", scopeId: o.id } } }] },
      select: { email: true },
    });
    const to = unique(admins.map((a) => a.email));
    if (!to.length) continue;
    plan.push({ account: o.name, to, notice: ended ? "ended" : "soon" });
    if (dryRun) continue;
    const n = await sendTrialNoticeEmail({ to, accountName: o.name, endsAt: o.trialEndsAt!, ended, group: false, link: `${origin}/office/billing` }).catch(() => 0);
    if (n > 0) {
      sent += n;
      await prisma.office.update({ where: { id: o.id }, data: { trialNoticeStage: stage } });
    }
  }

  // Groups (one trial for every location).
  const orgs = await prisma.organization.findMany({
    where: { trialEndsAt: { not: null, lte: soon }, trialNoticeStage: { lt: 2 }, isDemo: false },
    select: { id: true, name: true, trialEndsAt: true, trialNoticeStage: true, offices: { select: { subscription: { select: { status: true } } } } },
  });
  for (const g of orgs) {
    const allActive = g.offices.length > 0 && g.offices.every((o) => o.subscription?.status === "ACTIVE" || o.subscription?.status === "PAST_DUE");
    if (allActive) continue;
    const ended = g.trialEndsAt!.getTime() <= now;
    const stage = ended ? 2 : 1;
    if (g.trialNoticeStage >= stage) continue;
    const admins = await prisma.user.findMany({
      where: { status: "ACTIVE", organizationId: g.id, OR: [{ role: "GROUP_ADMIN" }, { memberships: { some: { role: "GROUP_ADMIN", scopeId: g.id } } }] },
      select: { email: true },
    });
    const to = unique(admins.map((a) => a.email));
    if (!to.length) continue;
    plan.push({ account: g.name, to, notice: ended ? "ended" : "soon" });
    if (dryRun) continue;
    const n = await sendTrialNoticeEmail({ to, accountName: g.name, endsAt: g.trialEndsAt!, ended, group: true, link: `${origin}/group/locations` }).catch(() => 0);
    if (n > 0) {
      sent += n;
      await prisma.organization.update({ where: { id: g.id }, data: { trialNoticeStage: stage } });
    }
  }

  return { considered: offices.length + orgs.length, sent: dryRun ? plan.length : sent, plan };
}
