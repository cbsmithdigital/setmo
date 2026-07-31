import { z } from "zod";
import { getPlatformActor } from "@/lib/auth";
import { savePlatformConfig, type ConfigPatch } from "@/lib/config";
import { logAdminAction } from "@/lib/platform";
import { error, json } from "@/lib/api";

const Body = z.object({
  accessMonthly: z.number().min(0).max(100000).optional(),
  anchors: z.array(z.tuple([z.number(), z.number()])).min(2).max(8).optional(),
  minMinutes: z.number().int().min(1).max(100000).optional(),
  maxMinutes: z.number().int().min(1).max(100000).optional(),
  basePerMin: z.number().min(0).max(100).optional(),
  groupThreshold: z.number().int().min(1).max(50).optional(),
  monthlyTokenDiscountPct: z.number().int().min(0).max(100).optional(),
  annualTokenDiscountPct: z.number().int().min(0).max(100).optional(),
  groupFreeMinutesMonthly: z.number().int().min(0).max(100000).optional(),
  groupTokenDiscountPct: z.number().int().min(0).max(100).optional(),
  assessmentCooldownDays: z.number().int().min(0).max(3650).optional(),
  alertLowBalanceDays: z.number().int().min(0).max(365).optional(),
  alertZeroUsageDays: z.number().int().min(0).max(365).optional(),
  alertLiabilityCeiling: z.number().min(0).optional(),
  promoBonusMonthlyMin: z.number().int().min(0).max(100000).optional(),
  promoBonusAnnualMin: z.number().int().min(0).max(100000).optional(),
  // Last live day (US Pacific). Shape + real-calendar-day check: "2026-13-01"
  // or "2026-02-30" would otherwise reach Prisma as Invalid/rolled-over Dates.
  promoEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDay, "Not a real calendar date").nullable().optional(),
});

function isCalendarDay(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** "2026-08-15" → the first instant of Aug 16 in US Pacific (exclusive cutoff). */
function nextDayPacific(day: string): Date {
  const end = new Date(`${day}T23:59:59-07:00`); // PDT; a promo deadline doesn't need DST precision
  return new Date(end.getTime() + 1000);
}

// POST /api/platform/config — edit platform configuration (Super-Admin only).
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor || actor.role !== "PLATFORM_ADMIN") return error("Super-admin only", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid config", 422);
  const b = parsed.data;

  const patch: ConfigPatch = {
    ...(b.accessMonthly != null ? { accessMonthlyCents: Math.round(b.accessMonthly * 100) } : {}),
    ...(b.anchors ? { minuteAnchors: b.anchors as [number, number][] } : {}),
    ...(b.minMinutes != null ? { minMinutes: b.minMinutes } : {}),
    ...(b.maxMinutes != null ? { maxMinutes: b.maxMinutes } : {}),
    ...(b.basePerMin != null ? { basePerMinCents: Math.round(b.basePerMin * 100) } : {}),
    ...(b.groupThreshold != null ? { groupThreshold: b.groupThreshold } : {}),
    ...(b.monthlyTokenDiscountPct != null ? { monthlyTokenDiscountPct: b.monthlyTokenDiscountPct } : {}),
    ...(b.annualTokenDiscountPct != null ? { annualTokenDiscountPct: b.annualTokenDiscountPct } : {}),
    ...(b.groupFreeMinutesMonthly != null ? { groupFreeMinutesMonthly: b.groupFreeMinutesMonthly } : {}),
    ...(b.groupTokenDiscountPct != null ? { groupTokenDiscountPct: b.groupTokenDiscountPct } : {}),
    ...(b.assessmentCooldownDays != null ? { assessmentCooldownDays: b.assessmentCooldownDays } : {}),
    ...(b.alertLowBalanceDays != null ? { alertLowBalanceDays: b.alertLowBalanceDays } : {}),
    ...(b.alertZeroUsageDays != null ? { alertZeroUsageDays: b.alertZeroUsageDays } : {}),
    ...(b.alertLiabilityCeiling != null ? { alertLiabilityCeilingCents: Math.round(b.alertLiabilityCeiling * 100) } : {}),
    ...(b.promoBonusMonthlyMin != null ? { promoBonusMonthlyMin: b.promoBonusMonthlyMin } : {}),
    ...(b.promoBonusAnnualMin != null ? { promoBonusAnnualMin: b.promoBonusAnnualMin } : {}),
    // The stored cutoff is exclusive: start of the day AFTER the last live day, US
    // Pacific. Clearing the date falls back to the code default — end the promo
    // early by zeroing the bonuses or setting a past date.
    ...(b.promoEndsAt !== undefined ? { promoEndsAt: b.promoEndsAt ? nextDayPacific(b.promoEndsAt) : null } : {}),
  };

  await savePlatformConfig(patch, actor.id);
  await logAdminAction(actor, { action: "config.update", summary: "Updated platform config", detail: patch });
  return json({ ok: true });
}
