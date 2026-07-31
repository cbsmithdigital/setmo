import { cache } from "react";
import { prisma } from "@/lib/db";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

// Effective platform config = DB row (if any) merged over code defaults. The
// PricingConfig slice is what the pricing functions consume.
export type PlatformConfig = PricingConfig & {
  monthlyTokenDiscountPct: number; // off token purchases for monthly accounts
  annualTokenDiscountPct: number; // off token purchases for annual-prepay accounts
  groupFreeMinutesMonthly: number; // free Setty Advisor voice minutes per group/DSO per month
  groupTokenDiscountPct: number; // off list for group/DSO token purchases
  assessmentCooldownDays: number;
  alertLowBalanceDays: number;
  alertZeroUsageDays: number;
  alertLiabilityCeiling: number; // dollars
  promoBonusMonthlyMin: number; // sign-up promo: bonus minutes granted on monthly activation (0 = off)
  promoBonusAnnualMin: number; // sign-up promo: bonus minutes granted on annual activation
  promoEndsAt: Date | null; // sign-up promo cutoff — payment before this instant earns the bonus
};

export const DEFAULT_CONFIG: PlatformConfig = {
  ...DEFAULT_PRICING,
  monthlyTokenDiscountPct: 8,
  annualTokenDiscountPct: 15,
  groupFreeMinutesMonthly: 120,
  groupTokenDiscountPct: 50,
  assessmentCooldownDays: 30, // one free audit per email per 30 days
  alertLowBalanceDays: 14,
  alertZeroUsageDays: 14,
  alertLiabilityCeiling: 10000,
  promoBonusMonthlyMin: 180, // 3 free hours (1,800 tokens)
  promoBonusAnnualMin: 540, // 9 free hours (5,400 tokens)
  promoEndsAt: new Date("2026-08-16T07:00:00Z"), // end of Aug 15, US Pacific
};

// Cached per request.
export const getPlatformConfig = cache(async (): Promise<PlatformConfig> => {
  try {
    const row = await prisma.platformConfig.findUnique({ where: { id: "default" } });
    if (!row) return DEFAULT_CONFIG;
    return {
      accessMonthly: row.accessMonthlyCents / 100,
      anchors: (row.minuteAnchors as [number, number][] | null) ?? DEFAULT_PRICING.anchors,
      minMinutes: row.minMinutes,
      maxMinutes: row.maxMinutes,
      basePerMin: row.basePerMinCents / 100,
      groupThreshold: row.groupThreshold,
      monthlyTokenDiscountPct: row.monthlyTokenDiscountPct,
      annualTokenDiscountPct: row.annualTokenDiscountPct,
      groupFreeMinutesMonthly: row.groupFreeMinutesMonthly,
      groupTokenDiscountPct: row.groupTokenDiscountPct,
      assessmentCooldownDays: row.assessmentCooldownDays,
      alertLowBalanceDays: row.alertLowBalanceDays,
      alertZeroUsageDays: row.alertZeroUsageDays,
      alertLiabilityCeiling: row.alertLiabilityCeilingCents / 100,
      promoBonusMonthlyMin: row.promoBonusMonthlyMin,
      promoBonusAnnualMin: row.promoBonusAnnualMin,
      // No stored date falls back to the code default; end the promo early by
      // setting the bonus minutes to 0 (or an earlier date).
      promoEndsAt: row.promoEndsAt ?? DEFAULT_CONFIG.promoEndsAt,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
});

/** Sign-up promo: bonus minutes earned by activating access (payment completed)
 *  before `promoEndsAt`. 0 when the promo is off or has ended. */
export function promoBonusMinutes(cfg: PlatformConfig, plan: "monthly" | "annual", at: Date = new Date()): number {
  if (!cfg.promoEndsAt || at >= cfg.promoEndsAt) return 0;
  return Math.max(0, plan === "annual" ? cfg.promoBonusAnnualMin : cfg.promoBonusMonthlyMin);
}

export type PromoInfo = { monthlyTokens: number; annualTokens: number; endsAt: string };

/** Display summary of the live sign-up promo for banners (signup page, activation
 *  card) — null when the promo is off or has ended. The stored cutoff is an
 *  exclusive instant (start of the day after the deadline, US Pacific), so the
 *  label shows the last day the offer is live. */
export function promoInfo(cfg: PlatformConfig): PromoInfo | null {
  const monthly = promoBonusMinutes(cfg, "monthly");
  const annual = promoBonusMinutes(cfg, "annual");
  if (!cfg.promoEndsAt || (monthly <= 0 && annual <= 0)) return null;
  return {
    monthlyTokens: monthly * 10,
    annualTokens: annual * 10,
    endsAt: new Date(cfg.promoEndsAt.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }),
  };
}

/** The PricingConfig slice (for pricing.ts functions + client sliders). */
export async function getPricingConfig(): Promise<PricingConfig> {
  const c = await getPlatformConfig();
  return { accessMonthly: c.accessMonthly, anchors: c.anchors, minMinutes: c.minMinutes, maxMinutes: c.maxMinutes, basePerMin: c.basePerMin, groupThreshold: c.groupThreshold };
}

export type ConfigPatch = {
  accessMonthlyCents?: number;
  minuteAnchors?: [number, number][];
  minMinutes?: number;
  maxMinutes?: number;
  basePerMinCents?: number;
  groupThreshold?: number;
  monthlyTokenDiscountPct?: number;
  annualTokenDiscountPct?: number;
  groupFreeMinutesMonthly?: number;
  groupTokenDiscountPct?: number;
  assessmentCooldownDays?: number;
  alertLowBalanceDays?: number;
  alertZeroUsageDays?: number;
  alertLiabilityCeilingCents?: number;
  promoBonusMonthlyMin?: number;
  promoBonusAnnualMin?: number;
  promoEndsAt?: Date | null;
};

export async function savePlatformConfig(patch: ConfigPatch, updatedById: string) {
  const data = { ...patch, minuteAnchors: (patch.minuteAnchors ?? undefined) as never, updatedById };
  return prisma.platformConfig.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
}
