// ===========================================================================
// Flat-access + pay-as-you-go-minutes pricing — PURE model (no Stripe SDK),
// safe to import from client components. stripe.ts re-exports for servers.
//   Access  — $44.95 / month per location (practice). Unlimited free users.
//   Minutes — bought in any amount via a slider; price/min tapers with volume
//             and rolls over. Separate balance per location.
//   Groups  — same flat model; group admin + Advisor unlock free at 2+ locations.
// All features are included for everyone.
// ===========================================================================

export const ACCESS_MONTHLY_USD = 44.95;

export const MIN_MINUTES = 240; // 1 person on the phones
export const MAX_MINUTES = 1200; // beyond this → contact for bulk
export const MINUTE_STEP = 10;
export const BASE_PER_MIN = 0.72; // the entry rate; discounts are measured against this

// minutes → $/min anchors; interpolated between, floored at 1,500.
const ANCHORS: [number, number][] = [
  [250, 0.72],
  [500, 0.66],
  [1000, 0.6],
  [1500, 0.56], // floor — best rate, holds out to MAX_MINUTES
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Per-minute price at a given balance size (continuous, for the slider). */
export function minutePrice(minutes: number): number {
  const m = minutes;
  if (m <= ANCHORS[0][0]) return ANCHORS[0][1];
  if (m >= ANCHORS[ANCHORS.length - 1][0]) return ANCHORS[ANCHORS.length - 1][1];
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [m0, p0] = ANCHORS[i];
    const [m1, p1] = ANCHORS[i + 1];
    if (m >= m0 && m <= m1) {
      const t = (m - m0) / (m1 - m0);
      return round2(p0 + (p1 - p0) * t);
    }
  }
  return ANCHORS[ANCHORS.length - 1][1];
}

export type MinuteQuote = { minutes: number; perMin: number; total: number; discountPct: number };

/** Full quote for a chosen minute amount (clamped to the self-serve range). */
export function minuteQuote(minutes: number): MinuteQuote {
  const m = clamp(Math.round(minutes / MINUTE_STEP) * MINUTE_STEP, MIN_MINUTES, MAX_MINUTES);
  const perMin = minutePrice(m);
  const total = Math.round(m * perMin);
  const discountPct = Math.max(0, Math.round((1 - perMin / BASE_PER_MIN) * 100));
  return { minutes: m, perMin, total, discountPct };
}

/** True once the chosen amount needs a bulk conversation instead of self-serve. */
export const isBulk = (minutes: number) => minutes > MAX_MINUTES;

/** Recommended starting balance from how many people are on the phones. */
export function recommendMinutes(people: number): number {
  const p = Math.max(1, Math.round(people));
  let m: number;
  if (p <= 1) m = 240;
  else if (p <= 3) m = 240 + ((p - 1) / 2) * (500 - 240);
  else if (p <= 8) m = 500 + ((p - 3) / 5) * (1000 - 500);
  else m = 1000 + (p - 8) * 100;
  return clamp(Math.round(m / MINUTE_STEP) * MINUTE_STEP, MIN_MINUTES, MAX_MINUTES);
}

/** Group features (command center, Setty Advisor) unlock free at 2+ locations. */
export function groupEnabled(locationCount: number): boolean {
  return locationCount >= 2;
}

/** Feature entitlements. Everything is included for everyone; the only gate is
 *  that group/DSO surfaces require a multi-location account. */
export function entitlements(locationCount = 1) {
  const group = groupEnabled(locationCount);
  return {
    officeCoach: true, // Setty Office Coach — included for all
    leaderboards: true,
    goals: true,
    groupCommandCenter: group,
    advisor: group,
  };
}
