import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { reprocessUnmappedFor } from "@/lib/ghl";
import { captureError } from "@/lib/observability";
import { error, json } from "@/lib/api";

export const maxDuration = 300;

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    officeId: z.string().min(1),
    ghlLocationId: z.string().min(3).max(64),
    pitToken: z.string().max(200).optional(),
  }),
  z.object({ action: z.literal("map_user"), ghlUserId: z.string().min(1).max(64), email: z.string().email() }),
  z.object({ action: z.literal("toggle"), integrationId: z.string().min(1) }),
]);

// POST /api/platform/ghl — super-admin management of GHL live-call integrations:
// connect a sub-account to an office, map GHL agents to SetMo users (replays any
// held calls), pause/resume an integration.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const d = parsed.data;

  if (d.action === "create") {
    const office = await prisma.office.findUnique({ where: { id: d.officeId }, select: { name: true } });
    if (!office) return error("Office not found", 404);
    const existing = await prisma.ghlIntegration.findFirst({ where: { OR: [{ officeId: d.officeId }, { ghlLocationId: d.ghlLocationId }] } });
    if (existing) return error("That office or GHL location is already connected.", 409);
    const integration = await prisma.ghlIntegration.create({
      data: { officeId: d.officeId, ghlLocationId: d.ghlLocationId, webhookSecret: randomBytes(18).toString("hex"), pitToken: d.pitToken || null },
    });
    await logAdminAction(actor, { action: "ghl.connect", summary: `Connected GHL location ${d.ghlLocationId} to ${office.name}`, targetType: "office", targetId: d.officeId });
    return json({ ok: true, integrationId: integration.id });
  }

  if (d.action === "map_user") {
    const user = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() }, select: { id: true, firstName: true, lastName: true } });
    if (!user) return error("No SetMo user with that email.", 404);
    await prisma.ghlUserMap.upsert({ where: { ghlUserId: d.ghlUserId }, update: { userId: user.id }, create: { ghlUserId: d.ghlUserId, userId: user.id } });
    // Held calls replay in the BACKGROUND (each is ~1-2 min of LLM work — far
    // too slow to run inside the request). The atomic event claim makes retries
    // and double-clicks safe.
    const held = await prisma.ghlInboundEvent.count({ where: { ghlUserId: d.ghlUserId, status: "UNMAPPED_USER" } });
    if (held > 0) {
      after(async () => {
        try {
          await reprocessUnmappedFor(d.ghlUserId);
        } catch (e) {
          captureError(e, { where: "ghl-map-user-replay", ghlUserId: d.ghlUserId });
        }
      });
    }
    await logAdminAction(actor, { action: "ghl.map_user", summary: `Mapped GHL user ${d.ghlUserId} → ${d.email}${held ? ` (replaying ${held} held calls)` : ""}`, targetType: "user", targetId: user.id });
    return json({ ok: true, replayed: held });
  }

  // toggle
  const integration = await prisma.ghlIntegration.findUnique({ where: { id: d.integrationId } });
  if (!integration) return error("Integration not found", 404);
  const status = integration.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
  await prisma.ghlIntegration.update({ where: { id: d.integrationId }, data: { status } });
  await logAdminAction(actor, { action: "ghl.toggle", summary: `${status === "PAUSED" ? "Paused" : "Resumed"} GHL integration ${integration.ghlLocationId}`, targetType: "office", targetId: integration.officeId });
  return json({ ok: true, status });
}
