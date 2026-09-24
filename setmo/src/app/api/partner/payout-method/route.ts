import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { error, json } from "@/lib/api";

const Body = z.object({ method: z.enum(["CASH", "CREDIT"]) });

// POST /api/partner/payout-method — partner admin sets cash vs credit.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.partnerId || getActiveRole(user) !== "PARTNER_ADMIN") return error("Forbidden", 403);
  if (!user.partner?.commissionsEnabled) return error("Payouts aren't part of your partner arrangement.", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  if (parsed.data.method === "CREDIT") {
    // A demo account doesn't count — credit only lands in a real practice the
    // partner admin runs (the same rule the payout run applies).
    const hasPractice = await prisma.user.findFirst({
      where: { partnerId: user.partnerId, officeId: { not: null }, office: { isDemo: false }, OR: [{ role: "PARTNER_ADMIN" }, { memberships: { some: { role: "PARTNER_ADMIN" } } }] },
      select: { id: true },
    });
    if (!hasPractice) return error("Credit payout needs a linked SetMo practice. Use cash, or open a practice first.", 422);
  }
  await prisma.partner.update({ where: { id: user.partnerId }, data: { payoutMethod: parsed.data.method } });
  return json({ ok: true });
}
