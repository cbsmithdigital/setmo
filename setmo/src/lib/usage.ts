import { prisma } from "@/lib/db";
import { minuteQuote } from "@/lib/pricing";
import { getPricingConfig } from "@/lib/config";

// Minimum remaining time required to start a new (non-assessment) session.
const MIN_START_SECONDS = 60;

// Pay-as-you-go minute balance per location: purchased minutes (roll over, never
// reset) minus minutes consumed by real calls. Assessment (isAudit) calls are
// free — SetMo covers them — so they never count against the balance.
export async function getMinuteBalance(officeId: string): Promise<{ purchasedMin: number; usedMin: number; remainingMin: number; remainingSeconds: number }> {
  const [purchases, used] = await Promise.all([
    prisma.conversationBundle.aggregate({ where: { officeId }, _sum: { minutesPurchased: true } }),
    prisma.session.aggregate({ where: { officeId, isAudit: false, durationSeconds: { not: null } }, _sum: { durationSeconds: true } }),
  ]);
  const purchasedMin = purchases._sum.minutesPurchased ?? 0;
  const usedMin = Math.round((used._sum.durationSeconds ?? 0) / 60);
  const remainingMin = purchasedMin - usedMin;
  return { purchasedMin, usedMin, remainingMin, remainingSeconds: Math.max(0, remainingMin * 60) };
}

/** Append purchased minutes to a location's rolling balance (one row per purchase). */
export async function addMinutes(officeId: string, minutes: number, stripePaymentIntent?: string | null) {
  const amountCents = Math.round(minuteQuote(minutes, await getPricingConfig()).total * 100); // cash revenue (matches checkout price)
  return prisma.conversationBundle.create({
    data: { officeId, minutesPurchased: minutes, minutesRemaining: minutes, hours: Math.round(minutes / 60), amountCents, stripePaymentIntent: stripePaymentIntent ?? null },
  });
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
