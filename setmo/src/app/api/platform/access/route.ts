import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { error, json } from "@/lib/api";

const Body = z.object({ officeId: z.string().min(1), action: z.enum(["activate", "pause"]) });

// POST /api/platform/access — comp/activate or pause a location's Practice Access.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { officeId, action } = parsed.data;

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { name: true } });
  if (!office) return error("Location not found", 404);

  const status = action === "activate" ? "ACTIVE" : "CANCELED";
  await prisma.subscription.upsert({ where: { officeId }, update: { status }, create: { officeId, status } });
  await logAdminAction(actor, { action: `access.${action}`, summary: `${action === "activate" ? "Activated" : "Paused"} access for ${office.name}`, targetType: "office", targetId: officeId });
  return json({ ok: true });
}
