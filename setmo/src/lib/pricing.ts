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
export const MINUTES_PER_CALL = 6.5; // ≈ typical practice call — 64 real scored calls averaged ~6.6 min (Oct 2026)
export const TOKENS_PER_CALL = MINUTES_PER_CALL * TOKENS_PER_MINUTE; // 65

// Default account discount on a monthly account's token purchases. The live
// value is platform config (getPlatformConfig().monthlyTokenDiscountPct); this is
// for client components that can't read it.
export const DEFAULT_MONTHLY_TOKEN_DISCOUNT_PCT = 8;

export const minutesToTokens = (m: number) => Math.round(m * TOKENS_PER_MINUTE);
export const tokensToMinutes = (t: number) => Math.round(t / TOKENS_PER_MINUTE);

/** ≈ practice calls a minute balance covers. It's an estimate, so it rounds
 *  down (to a multiple of 5 past a handful) and never promises more calls than
 *  the minutes buy. */
export function minutesToCalls(minutes: number): number {
  const calls = Math.floor(minutes / MINUTES_PER_CALL);
  return calls >= 10 ? Math.floor(calls / 5) * 5 : Math.max(0, calls);
}
export const tokensToCalls = (t: number) => minutesToCalls(t / TOKENS_PER_MINUTE);
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
    perToken: Math.round((total / tk) * 1000) / 1000, // shown to 3 decimals, so round there ($0.066, not $0.07)
    total,
    listTotal,
    volumeDiscountPct: q.discountPct,
    accountDiscountPct,
    calls: minutesToCalls(q.minutes),
  };
}

export type ActivationCost = {
  access: number; // first month of Practice Access
  starterTokens: number; // the smallest starter balance
  starter: number; // $ for it, after the monthly account discount
  total: number; // $ due on day one, before tax
};

/** The smallest first payment on the monthly plan: a month of access plus the
 *  minimum starter tokens, which activation requires unless a sign-up promo is
 *  live (its bonus tokens are the starter balance). Same math as the checkout. */
export function activationFrom(cfg: PricingConfig = DEFAULT_PRICING, monthlyDiscountPct = DEFAULT_MONTHLY_TOKEN_DISCOUNT_PCT): ActivationCost {
  const starter = tokenQuote(minTokens(cfg), cfg, monthlyDiscountPct);
  return { access: cfg.accessMonthly, starterTokens: starter.tokens, starter: starter.total, total: round2(cfg.accessMonthly + starter.total) };
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
