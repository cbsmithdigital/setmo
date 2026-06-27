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
    };
  } catch {
    return DEFAULT_CONFIG;
  }
});

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
};

export async function savePlatformConfig(patch: ConfigPatch, updatedById: string) {
  const data = { ...patch, minuteAnchors: (patch.minuteAnchors ?? undefined) as never, updatedById };
  return prisma.platformConfig.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
}
