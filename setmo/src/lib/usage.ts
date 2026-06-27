import { prisma } from "@/lib/db";
import { minuteQuote, tokenQuote, minutesToTokens } from "@/lib/pricing";
import { getPricingConfig, getPlatformConfig } from "@/lib/config";

// Minimum remaining time required to start a new (non-assessment) session.
const MIN_START_SECONDS = 60;

// Pay-as-you-go minute balance per location: purchased minutes (roll over, never
// reset) minus minutes consumed by real calls. Assessment (isAudit) calls are
// free — SetMo covers them — so they never count against the balance.
export async function getMinuteBalance(officeId: string): Promise<{ purchasedMin: number; usedMin: number; remainingMin: number; remainingSeconds: number }> {
  const [purchases, used] = await Promise.all([
    prisma.conversationBundle.aggregate({ where: { officeId }, _sum: { minutesPurchased: true } }),
    // Exclude group/DSO coach sessions (organizationId set) — those meter against
    // the org wallet, not this office's pool.
    prisma.session.aggregate({ where: { officeId, organizationId: null, isAudit: false, durationSeconds: { not: null } }, _sum: { durationSeconds: true } }),
  ]);
  const purchasedMin = purchases._sum.minutesPurchased ?? 0;
  const usedMin = Math.round((used._sum.durationSeconds ?? 0) / 60);
  const remainingMin = purchasedMin - usedMin;
  return { purchasedMin, usedMin, remainingMin, remainingSeconds: Math.max(0, remainingMin * 60) };
}

/** Append purchased minutes to a location's rolling balance (one row per purchase).
 *  Pass `amountCents` to record the actual (post-discount) cash; otherwise the
 *  list price is used. */
export async function addMinutes(officeId: string, minutes: number, stripePaymentIntent?: string | null, amountCents?: number) {
  const cents = amountCents ?? Math.round(minuteQuote(minutes, await getPricingConfig()).total * 100);
  return prisma.conversationBundle.create({
    data: { officeId, minutesPurchased: minutes, minutesRemaining: minutes, hours: Math.round(minutes / 60), amountCents: cents, stripePaymentIntent: stripePaymentIntent ?? null },
  });
}

/** Account's token-purchase discount tier: annual 15% / monthly 8% / none 0% (config-driven). */
export async function accountTokenDiscountPct(officeId: string): Promise<number> {
  const { getPlatformConfig } = await import("@/lib/config");
  const cfg = await getPlatformConfig();
  const sub = await prisma.subscription.findUnique({ where: { officeId }, select: { status: true, plan: true } });
  if (!sub || sub.status !== "ACTIVE") return 0;
  return sub.plan === "ANNUAL" ? cfg.annualTokenDiscountPct : cfg.monthlyTokenDiscountPct;
}

/** Pre-session gate. Assessment calls are always allowed (free); practice/coach
 *  calls require a positive balance. */
export async function canStartSession(officeId: string, opts: { isAudit?: boolean } = {}): Promise<{ ok: boolean; remainingSeconds: number }> {
  if (opts.isAudit) return { ok: true, remainingSeconds: Number.POSITIVE_INFINITY };
  const b = await getMinuteBalance(officeId);
  return { ok: b.remainingSeconds > MIN_START_SECONDS, remainingSeconds: b.remainingSeconds };
}

// Auto top-up / low-minute alert thresholds (minutes remaining).
const ALERT_100 = 100;
const ALERT_60 = 60;
const AUTO_TOPUP_AT = 25;

/** Minutes in the office's most recent purchase — what auto top-up re-buys. */
export async function lastPurchasedMinutes(officeId: string): Promise<number> {
  const last = await prisma.conversationBundle.findFirst({ where: { officeId }, orderBy: { purchasedAt: "desc" }, select: { minutesPurchased: true } });
  return last?.minutesPurchased ?? 0;
}

/** Active office admins (incl. group admins) who should get billing alerts. */
async function officeAdminEmails(officeId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: {
      officeId,
      status: "ACTIVE",
      OR: [{ role: { in: ["OFFICE_ADMIN", "GROUP_ADMIN"] } }, { memberships: { some: { role: { in: ["OFFICE_ADMIN", "GROUP_ADMIN"] } } } }],
    },
    select: { email: true },
  });
  return Array.from(new Set(admins.map((a) => a.email).filter(Boolean)));
}

/**
 * Run after a call consumes minutes (and as a daily sweep). Sends low-balance
 * alerts to admins at 100 and 60 minutes (so they have time to turn auto top-up
 * off), and — if auto top-up is on — auto-buys the last-purchased amount once the
 * balance dips below 25.
 */
export async function evaluateMinuteThresholds(officeId: string): Promise<void> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { id: true, name: true, stripeCustomerId: true, autoTopUp: true, minuteAlertStage: true, lastAutoTopUpAt: true },
  });
  if (!office) return;

  const { remainingMin } = await getMinuteBalance(officeId);

  // Pool is healthy again → reset so a future drop re-alerts.
  if (remainingMin > ALERT_100) {
    if (office.minuteAlertStage !== 0) await prisma.office.update({ where: { id: officeId }, data: { minuteAlertStage: 0 } });
    return;
  }

  // Auto top-up below 25 min (guarded so we don't re-charge while it's landing).
  if (remainingMin < AUTO_TOPUP_AT && office.autoTopUp && office.stripeCustomerId) {
    const charging = office.lastAutoTopUpAt && Date.now() - office.lastAutoTopUpAt.getTime() < 30 * 60 * 1000;
    const amount = charging ? 0 : await lastPurchasedMinutes(officeId);
    if (amount > 0) {
      await prisma.office.update({ where: { id: officeId }, data: { lastAutoTopUpAt: new Date() } }); // claim before charging
      const { chargeMinutesAuto } = await import("@/lib/stripe");
      await chargeMinutesAuto({ officeId, customerId: office.stripeCustomerId, minutes: amount }).catch(() => {});
    }
  }

  // Low-balance alerts: 100 first, then 60.
  let stage = office.minuteAlertStage;
  const alert = async (threshold: number) => {
    const to = await officeAdminEmails(officeId);
    if (!to.length) return;
    const { sendMinuteLowEmail } = await import("@/lib/email");
    await sendMinuteLowEmail({ to, practiceName: office.name, remaining: remainingMin, autoTopUp: office.autoTopUp, topUpMinutes: await lastPurchasedMinutes(officeId), threshold }).catch(() => {});
  };
  if (remainingMin <= ALERT_60 && stage < 2) { await alert(ALERT_60); stage = 2; }
  else if (remainingMin <= ALERT_100 && stage < 1) { await alert(ALERT_100); stage = 1; }
  if (stage !== office.minuteAlertStage) await prisma.office.update({ where: { id: officeId }, data: { minuteAlertStage: stage } });
}

/** Daily safety-net sweep: evaluate thresholds for every office that has bought minutes. */
export async function sweepMinuteThresholds(): Promise<{ checked: number }> {
  const offices = await prisma.office.findMany({ where: { bundles: { some: {} } }, select: { id: true } });
  for (const o of offices) await evaluateMinuteThresholds(o.id).catch(() => {});
  return { checked: offices.length };
}

// ===========================================================================
// GROUP / DSO COACH WALLET — the Setty Advisor voice for a group leader is
// metered against a PER-ORGANIZATION wallet (NOT an office pool):
//   • a free monthly voice allowance (config: groupFreeMinutesMonthly, default
//     120 min) that resets each calendar month (use-it-or-lose-it), then
//   • rolling PURCHASED tokens (OrgTokenBundle) that never reset.
// Consumption is derived from group-coach Session rows (organizationId set), so
// the balance can never drift. Extra tokens are sold to group admins at
// groupTokenDiscountPct off list (default 50%). They're prompted to add a card
// at GROUP_ALERT_MIN remaining; new sessions hard-block once the wallet is empty.
// ===========================================================================

// Remaining minutes at which group admins are nudged to add a card / buy more.
const GROUP_ALERT_MIN = 15;

export type OrgCoachBalance = {
  freePerMonth: number;
  freeUsedThisMonth: number;
  freeRemaining: number;
  purchasedTotal: number;
  purchasedRemaining: number;
  remainingMin: number;
  remainingSeconds: number;
  periodResetsOn: Date;
};

/** The group/DSO coach wallet balance: this month's free allowance + rolling purchased tokens, minus group-coach usage. */
export async function getOrgCoachBalance(orgId: string): Promise<OrgCoachBalance> {
  const cfg = await getPlatformConfig();
  const freePerMonth = cfg.groupFreeMinutesMonthly;

  const [sessions, purchases] = await Promise.all([
    prisma.session.findMany({
      where: { organizationId: orgId, isAudit: false, durationSeconds: { not: null } },
      select: { startedAt: true, durationSeconds: true },
    }),
    prisma.orgTokenBundle.aggregate({ where: { organizationId: orgId }, _sum: { minutesPurchased: true } }),
  ]);

  const now = new Date();
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const curKey = monthKey(now);
  const byMonth = new Map<string, number>(); // calendar month → minutes consumed
  for (const s of sessions) byMonth.set(monthKey(s.startedAt), (byMonth.get(monthKey(s.startedAt)) ?? 0) + Math.round((s.durationSeconds ?? 0) / 60));

  const freeUsedThisMonth = byMonth.get(curKey) ?? 0;
  const freeRemaining = Math.max(0, freePerMonth - freeUsedThisMonth);

  // Purchased tokens are spent only on overflow past each month's free grant.
  let overflow = 0;
  for (const min of byMonth.values()) overflow += Math.max(0, min - freePerMonth);
  const purchasedTotal = purchases._sum.minutesPurchased ?? 0;
  const purchasedRemaining = Math.max(0, purchasedTotal - overflow);

  const remainingMin = freeRemaining + purchasedRemaining;
  return {
    freePerMonth,
    freeUsedThisMonth,
    freeRemaining,
    purchasedTotal,
    purchasedRemaining,
    remainingMin,
    remainingSeconds: Math.max(0, remainingMin * 60),
    periodResetsOn: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

/** Pre-session gate for the group/DSO Setty Advisor voice. */
export async function canStartGroupCoach(orgId: string): Promise<{ ok: boolean; remainingSeconds: number }> {
  const b = await getOrgCoachBalance(orgId);
  return { ok: b.remainingSeconds > MIN_START_SECONDS, remainingSeconds: b.remainingSeconds };
}

/** The group/DSO token-purchase discount (off list), config-driven (default 50%). */
export async function groupTokenDiscountPct(): Promise<number> {
  return (await getPlatformConfig()).groupTokenDiscountPct;
}

/** Append purchased tokens to a group's rolling wallet. Pass `amountCents` for
 *  the actual (post-discount) cash; otherwise the 50%-off list price is used. */
export async function addOrgTokens(orgId: string, minutes: number, stripePaymentIntent?: string | null, amountCents?: number) {
  let cents = amountCents;
  if (cents == null) {
    const [pc, cfg] = await Promise.all([getPricingConfig(), getPlatformConfig()]);
    cents = Math.round(tokenQuote(minutesToTokens(minutes), pc, cfg.groupTokenDiscountPct).total * 100);
  }
  return prisma.orgTokenBundle.create({
    data: { organizationId: orgId, minutesPurchased: minutes, amountCents: cents, stripePaymentIntent: stripePaymentIntent ?? null },
  });
}

/** Active group admins for an org (for billing alerts). */
async function groupAdminEmails(orgId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { organizationId: orgId, status: "ACTIVE", OR: [{ role: "GROUP_ADMIN" }, { memberships: { some: { role: "GROUP_ADMIN" } } }] },
    select: { email: true },
  });
  return Array.from(new Set(admins.map((a) => a.email).filter(Boolean)));
}

/** Run after a group-coach call (and as a daily sweep): email group admins to add
 *  a card / buy more once the wallet falls to the alert threshold; reset above it. */
export async function evaluateOrgCoachThreshold(orgId: string): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true, coachAlertStage: true } });
  if (!org) return;
  const { remainingMin } = await getOrgCoachBalance(orgId);

  if (remainingMin > GROUP_ALERT_MIN) {
    if (org.coachAlertStage !== 0) await prisma.organization.update({ where: { id: orgId }, data: { coachAlertStage: 0 } });
    return;
  }
  if (org.coachAlertStage < 1) {
    const to = await groupAdminEmails(orgId);
    if (to.length) {
      const { sendGroupCoachLowEmail } = await import("@/lib/email");
      await sendGroupCoachLowEmail({ to, orgName: org.name, remaining: remainingMin }).catch(() => {});
    }
    await prisma.organization.update({ where: { id: orgId }, data: { coachAlertStage: 1 } });
  }
}

/** Daily safety-net sweep: evaluate the coach wallet for every group/DSO. */
export async function sweepOrgCoachThresholds(): Promise<{ checked: number }> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  for (const o of orgs) await evaluateOrgCoachThreshold(o.id).catch(() => {});
  return { checked: orgs.length };
}
