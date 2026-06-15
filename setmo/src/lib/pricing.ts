// ===========================================================================
// 3-tier packaging — PURE pricing model (no Stripe SDK), safe to import from
// client components. stripe.ts re-exports these for server callers.
//   Team     — per setter seat
//   Practice — per location (incl. 1 manager + 2 setters) + extra setter seats
//   Group    — custom / sales-led (no self-serve checkout)
// Plans are quarterly or annual only; annual ≈ 10% off. Founders rates lock for
// the life of the plan and the offer closes Aug 1, 2026.
// ===========================================================================
export type PlanTier = "TEAM" | "PRACTICE" | "GROUP";
export type Cadence = "QUARTERLY" | "ANNUAL";

export const ANNUAL_DISCOUNT = 0.1;
export const FOUNDERS_CLOSE_ISO = "2026-08-01";
export function foundersOpen(now: Date = new Date()): boolean {
  return now.getTime() < new Date(FOUNDERS_CLOSE_ISO).getTime();
}

export const TIERS = {
  TEAM: { name: "Team", perSeatMonthly: { std: 199, founder: 129 } },
  PRACTICE: {
    name: "Practice",
    baseMonthly: { std: 499, founder: 349 },
    extraSeatMonthly: { std: 149, founder: 99 },
    includedManager: 1,
    includedSetters: 2,
  },
  GROUP: { name: "Group / DSO" },
} as const;

export type PlanConfig = {
  tier: PlanTier;
  cadence: Cadence;
  founder: boolean;
  seats?: number; // Team: setter seats
  extraSetters?: number; // Practice: setters beyond the 2 included
};

/** Setter seats a config grants (drives the pooled allowance). */
export function setterSeatsFor(c: { tier: PlanTier; seats?: number; extraSetters?: number }): number {
  if (c.tier === "TEAM") return Math.max(1, c.seats ?? 1);
  if (c.tier === "PRACTICE") return TIERS.PRACTICE.includedSetters + Math.max(0, c.extraSetters ?? 0);
  return c.seats ?? 0;
}

/** Monthly-equivalent rate for a plan config (before cadence multiplier). */
export function planMonthly(c: PlanConfig): number {
  const k = c.founder ? "founder" : "std";
  if (c.tier === "TEAM") return Math.max(1, c.seats ?? 1) * TIERS.TEAM.perSeatMonthly[k];
  if (c.tier === "PRACTICE") return TIERS.PRACTICE.baseMonthly[k] + Math.max(0, c.extraSetters ?? 0) * TIERS.PRACTICE.extraSeatMonthly[k];
  return 0; // Group is custom
}

/** Amount actually charged for the chosen cadence (quarterly = ×3; annual = ×12 −10%). */
export function planTotal(c: PlanConfig): number {
  const monthly = planMonthly(c);
  return c.cadence === "ANNUAL" ? Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT)) : monthly * 3;
}

/** Feature entitlements by tier (gating Setty Office Coach / Advisor). */
export function entitlements(tier: PlanTier | null | undefined) {
  return {
    officeCoach: tier === "PRACTICE" || tier === "GROUP",
    groupCommandCenter: tier === "GROUP",
    advisor: tier === "GROUP",
  };
}
