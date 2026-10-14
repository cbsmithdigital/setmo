import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor, isSuperAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { error, json } from "@/lib/api";

const Body = z.object({ accountId: z.string().min(1), enabled: z.boolean() });

// POST /api/platform/gift-cards — super admin turns gift-card rewards on or off
// for an account. accountId is the platform account id: the organization for a
// group (covers every location), the office for a single practice.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor || !isSuperAdmin(actor.role)) return error("Only a super admin can change gift cards", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { accountId, enabled } = parsed.data;

  const org = await prisma.organization.findUnique({ where: { id: accountId }, select: { id: true, name: true } });
  let name: string;
  if (org) {
    await prisma.organization.update({ where: { id: org.id }, data: { giftCardsEnabled: enabled } });
    name = org.name;
  } else {
    const office = await prisma.office.findUnique({ where: { id: accountId }, select: { name: true } });
    if (!office) return error("Account not found", 404);
    await prisma.office.update({ where: { id: accountId }, data: { giftCardsEnabled: enabled } });
    name = office.name;
  }

  await logAdminAction(actor, {
    action: enabled ? "giftcards.enable" : "giftcards.disable",
    summary: `${enabled ? "Turned on" : "Turned off"} gift cards for ${name}`,
    targetType: org ? "organization" : "office",
    targetId: accountId,
  });
  return json({ ok: true, enabled });
}
