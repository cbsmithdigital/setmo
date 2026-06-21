import { z } from "zod";
import { getPlatformActor } from "@/lib/auth";
import { approvePartner, setPartnerStatus, updatePartnerTerms } from "@/lib/partners";
import { ensurePartnerAdminUser } from "@/lib/partner-portal";
import { logAdminAction } from "@/lib/platform";
import { prisma } from "@/lib/db";
import { error, json } from "@/lib/api";

const Body = z.object({
  action: z.enum(["approve", "disable", "terms"]),
  partnerId: z.string().min(1),
  track: z.enum(["REFERRAL", "DISTRIBUTION"]).optional(),
  payoutMethod: z.enum(["CASH", "CREDIT"]).optional(),
  customRatePct: z.number().int().min(0).max(90).nullable().optional(),
});

// POST /api/platform/partners — approve/disable partners and set terms.
// Non-standard (custom) rates are Super-Admin only.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { action, partnerId, track, payoutMethod, customRatePct } = parsed.data;

  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { name: true } });
  if (!partner) return error("Partner not found", 404);

  if (action === "approve") {
    await approvePartner(partnerId, actor.id);
    const { inviteLink } = await ensurePartnerAdminUser(partnerId);
    await logAdminAction(actor, { action: "partner.approve", summary: `Approved partner ${partner.name}`, targetType: "partner", targetId: partnerId });
    return json({ ok: true, inviteLink });
  } else if (action === "disable") {
    await setPartnerStatus(partnerId, "DISABLED");
    await logAdminAction(actor, { action: "partner.disable", summary: `Disabled partner ${partner.name}`, targetType: "partner", targetId: partnerId });
  } else {
    // terms — custom rate is Super-Admin only
    if (customRatePct != null && actor.role !== "PLATFORM_ADMIN") return error("Custom rates are Super-Admin only", 403);
    await updatePartnerTerms(partnerId, { track, payoutMethod, ...(customRatePct !== undefined ? { customRatePct } : {}) });
    await logAdminAction(actor, { action: "partner.terms", summary: `Updated terms for ${partner.name}`, targetType: "partner", targetId: partnerId, detail: { track, payoutMethod, customRatePct } });
  }
  return json({ ok: true });
}
