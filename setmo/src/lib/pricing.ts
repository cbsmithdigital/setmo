// ===========================================================================
// Flat-access + pay-as-you-go-minutes pricing — PURE model (no Stripe SDK),
// safe to import from client components. Functions accept an optional config so
// Super-Admins can tune the numbers at runtime (see lib/config.ts); defaults
// mirror the launch pricing. stripe.ts re-exports for servers.
// ===========================================================================

export type PricingConfig = {
  accessMonthly: number; // $ / location / month
  anchors: [number, number][]; // minutes → $/min, interpolated between, floored at the last
  minMinutes: number;
  maxMinutes: number;
  basePerMin: number; // entry rate discounts are measured against
  groupThreshold: number; // locations needed to unlock group features
};

export const DEFAULT_PRICING: PricingConfig = {
  accessMonthly: 44.95,
  anchors: [
    [250, 0.72],
    [500, 0.66],
    [1000, 0.6],
    [1500, 0.56],
  ],
  minMinutes: 240,
  maxMinutes: 1200,
  basePerMin: 0.72,
  groupThreshold: 2,
};

// Back-compat constants (defaults) for callers that don't thread config.
export const ACCESS_MONTHLY_USD = DEFAULT_PRICING.accessMonthly;
export const MIN_MINUTES = DEFAULT_PRICING.minMinutes;
export const MAX_MINUTES = DEFAULT_PRICING.maxMinutes;
export const MINUTE_STEP = 10;
export const BASE_PER_MIN = DEFAULT_PRICING.basePerMin;

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Per-minute price at a given balance size (continuous, for the slider). */
export function minutePrice(minutes: number, cfg: PricingConfig = DEFAULT_PRICING): number {
  const A = cfg.anchors;
  if (minutes <= A[0][0]) return A[0][1];
  if (minutes >= A[A.length - 1][0]) return A[A.length - 1][1];
  for (let i = 0; i < A.length - 1; i++) {
    const [m0, p0] = A[i];
    const [m1, p1] = A[i + 1];
    if (minutes >= m0 && minutes <= m1) {
      const t = (minutes - m0) / (m1 - m0);
      return round2(p0 + (p1 - p0) * t);
    }
  }
  return A[A.length - 1][1];
}

export type MinuteQuote = { minutes: number; perMin: number; total: number; discountPct: number };

/** Full quote for a chosen minute amount (clamped to the self-serve range). */
export function minuteQuote(minutes: number, cfg: PricingConfig = DEFAULT_PRICING): MinuteQuote {
  const m = clamp(Math.round(minutes / MINUTE_STEP) * MINUTE_STEP, cfg.minMinutes, cfg.maxMinutes);
  const perMin = minutePrice(m, cfg);
  const total = Math.round(m * perMin);
  const discountPct = Math.max(0, Math.round((1 - perMin / cfg.basePerMin) * 100));
  return { minutes: m, perMin, total, discountPct };
}

/** True once the chosen amount needs a bulk conversation instead of self-serve. */
export const isBulk = (minutes: number, cfg: PricingConfig = DEFAULT_PRICING) => minutes > cfg.maxMinutes;

// ===========================================================================
// SetMo Tokens — the customer-facing unit. 1 minute of live AI work = 10 tokens.
// Internally everything is still minutes; tokens are a presentation + pricing
// layer (tokens = minutes×10, $/token = $/min÷10). An account discount (annual
// 15% / monthly 8%, config-driven) stacks on top of the volume-tier price.
// ===========================================================================
export const TOKENS_PER_MINUTE = 10;
export const TOKEN_STEP = MINUTE_STEP * TOKENS_PER_MINUTE; // 100
export const MINUTES_PER_CALL = 5; // ≈ typical practice call — calibrate after the first 9 sessions
export const TOKENS_PER_CALL = MINUTES_PER_CALL * TOKENS_PER_MINUTE; // 50

export const minutesToTokens = (m: number) => Math.round(m * TOKENS_PER_MINUTE);
export const tokensToMinutes = (t: number) => Math.round(t / TOKENS_PER_MINUTE);
export const tokensToCalls = (t: number) => Math.round(t / TOKENS_PER_CALL);
export const minTokens = (cfg: PricingConfig = DEFAULT_PRICING) => cfg.minMinutes * TOKENS_PER_MINUTE;
export const maxTokens = (cfg: PricingConfig = DEFAULT_PRICING) => cfg.maxMinutes * TOKENS_PER_MINUTE;

export type TokenQuote = {
  tokens: number;
  minutes: number;
  perToken: number;
  total: number; // $ charged (after the account discount)
  listTotal: number; // $ before the account discount
  volumeDiscountPct: number; // from buying more
  accountDiscountPct: number; // annual/monthly account tier
  calls: number; // ≈ practice calls
};

/** Full token quote. `accountDiscountPct` (0/8/15) stacks on the volume price. */
export function tokenQuote(tokens: number, cfg: PricingConfig = DEFAULT_PRICING, accountDiscountPct = 0): TokenQuote {
  const q = minuteQuote(tokensToMinutes(tokens), cfg); // volume-tier minute quote
  const tk = q.minutes * TOKENS_PER_MINUTE;
  const listTotal = q.total;
  const total = Math.round(listTotal * (1 - accountDiscountPct / 100));
  return {
    tokens: tk,
    minutes: q.minutes,
    perToken: round2(total / tk),
    total,
    listTotal,
    volumeDiscountPct: q.discountPct,
    accountDiscountPct,
    calls: Math.round(q.minutes / MINUTES_PER_CALL),
  };
}

/** Recommended starting tokens from how many people are on the phones. */
export const recommendTokens = (people: number, cfg: PricingConfig = DEFAULT_PRICING) => recommendMinutes(people, cfg) * TOKENS_PER_MINUTE;

/** Annual prepay = 2 months free → 10 × the monthly access price, billed yearly. */
export const annualAccessUsd = (cfg: PricingConfig = DEFAULT_PRICING) => round2(cfg.accessMonthly * 10);

/** Recommended starting balance from how many people are on the phones. */
export function recommendMinutes(people: number, cfg: PricingConfig = DEFAULT_PRICING): number {
  const p = Math.max(1, Math.round(people));
  const m3 = cfg.anchors[1]?.[0] ?? 500;
  const m8 = cfg.anchors[2]?.[0] ?? 1000;
  let m: number;
  if (p <= 1) m = cfg.minMinutes;
  else if (p <= 3) m = cfg.minMinutes + ((p - 1) / 2) * (m3 - cfg.minMinutes);
  else if (p <= 8) m = m3 + ((p - 3) / 5) * (m8 - m3);
  else m = m8 + (p - 8) * 100;
  return clamp(Math.round(m / MINUTE_STEP) * MINUTE_STEP, cfg.minMinutes, cfg.maxMinutes);
}

/** Group features (command center, Setty Advisor) unlock free at the threshold. */
export function groupEnabled(locationCount: number, threshold = DEFAULT_PRICING.groupThreshold): boolean {
  return locationCount >= threshold;
}

/** Feature entitlements. Everything is included for everyone; the only gate is
 *  that group/DSO surfaces require a multi-location account. */
export function entitlements(locationCount = 1, threshold = DEFAULT_PRICING.groupThreshold) {
  const group = groupEnabled(locationCount, threshold);
  return { officeCoach: true, leaderboards: true, goals: true, groupCommandCenter: group, advisor: group };
}
