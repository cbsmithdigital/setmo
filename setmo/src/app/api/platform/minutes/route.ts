import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { error, json } from "@/lib/api";

const Body = z.object({ officeId: z.string().min(1), minutes: z.number().int().min(1).max(100000), note: z.string().max(300).optional().nullable() });

// POST /api/platform/minutes — grant complimentary minutes to a location.
// Comp minutes carry $0 cash (not revenue), only future COGS.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { officeId, minutes, note } = parsed.data;

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { name: true } });
  if (!office) return error("Location not found", 404);

  await prisma.conversationBundle.create({
    data: { officeId, minutesPurchased: minutes, minutesRemaining: minutes, hours: Math.round(minutes / 60), amountCents: 0 },
  });
  await logAdminAction(actor, { action: "minutes.grant", summary: `Granted ${minutes.toLocaleString()} comp minutes to ${office.name}`, targetType: "office", targetId: officeId, detail: { minutes, note: note ?? null } });
  return json({ ok: true });
}
