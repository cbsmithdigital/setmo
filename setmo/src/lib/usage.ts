import { prisma } from "@/lib/db";

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
  return prisma.conversationBundle.create({
    data: { officeId, minutesPurchased: minutes, minutesRemaining: minutes, hours: Math.round(minutes / 60), stripePaymentIntent: stripePaymentIntent ?? null },
  });
}

/** Pre-session gate. Assessment calls are always allowed (free); practice/coach
 *  calls require a positive balance. */
export async function canStartSession(officeId: string, opts: { isAudit?: boolean } = {}): Promise<{ ok: boolean; remainingSeconds: number }> {
  if (opts.isAudit) return { ok: true, remainingSeconds: Number.POSITIVE_INFINITY };
  const b = await getMinuteBalance(officeId);
  return { ok: b.remainingSeconds > MIN_START_SECONDS, remainingSeconds: b.remainingSeconds };
}
