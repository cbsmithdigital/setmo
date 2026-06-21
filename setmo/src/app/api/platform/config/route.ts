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
  assessmentCooldownDays: z.number().int().min(0).max(3650).optional(),
  alertLowBalanceDays: z.number().int().min(0).max(365).optional(),
  alertZeroUsageDays: z.number().int().min(0).max(365).optional(),
  alertLiabilityCeiling: z.number().min(0).optional(),
});

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
    ...(b.assessmentCooldownDays != null ? { assessmentCooldownDays: b.assessmentCooldownDays } : {}),
    ...(b.alertLowBalanceDays != null ? { alertLowBalanceDays: b.alertLowBalanceDays } : {}),
    ...(b.alertZeroUsageDays != null ? { alertZeroUsageDays: b.alertZeroUsageDays } : {}),
    ...(b.alertLiabilityCeiling != null ? { alertLiabilityCeilingCents: Math.round(b.alertLiabilityCeiling * 100) } : {}),
  };

  await savePlatformConfig(patch, actor.id);
  await logAdminAction(actor, { action: "config.update", summary: "Updated platform config", detail: patch });
  return json({ ok: true });
}
