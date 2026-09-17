import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { hasPack } from "@/lib/packs/registry";
import { error, json } from "@/lib/api";

const SERVICES = ["IMPLANT", "DENTURE", "COSMETIC", "ORTHO", "WISDOM", "GENERAL"] as const;

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    serviceType: z.enum(SERVICES),
    status: z.enum(["PLANNED", "DRAFT", "BETA", "LIVE"]),
  }),
  // Let one practice try a call type while it's still in beta.
  z.object({
    action: z.literal("pilot"),
    serviceType: z.enum(SERVICES),
    officeId: z.string().min(1),
    pilot: z.boolean(),
  }),
]);

// POST /api/platform/services — roll a call type out (or pull it back).
// Status is what clients see and what session creation gates on, so it lives
// here rather than in the seed file, where a re-seed used to overwrite it.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const d = parsed.data;

  if (d.action === "pilot") {
    const office = await prisma.office.findUnique({ where: { id: d.officeId }, select: { name: true } });
    if (!office) return error("Office not found", 404);
    await prisma.officeService.upsert({
      where: { officeId_serviceType: { officeId: d.officeId, serviceType: d.serviceType } },
      update: { pilot: d.pilot, ...(d.pilot ? { enabled: true } : {}) },
      create: { officeId: d.officeId, serviceType: d.serviceType, enabled: d.pilot, pilot: d.pilot },
    });
    await logAdminAction(actor, {
      action: "service.pilot",
      summary: `${office.name} ${d.pilot ? "added to" : "removed from"} the ${d.serviceType} beta`,
      targetType: "office",
      targetId: d.officeId,
    });
    return json({ ok: true });
  }

  const { serviceType, status } = d;

  // A call type can only open to anyone once it actually has a pack behind it —
  // rubric, lead rules, the lot. Without one, every call would be graded as an
  // implant call against implant personas, which is exactly the denture bug.
  if ((status === "LIVE" || status === "BETA") && !hasPack(serviceType)) {
    return error("That call type has no pack yet — it can't open.", 409);
  }

  const agent = await prisma.agent.findUnique({ where: { serviceType }, select: { status: true } });
  if (!agent) return error("Unknown service", 404);
  if (agent.status === status) return json({ ok: true, status });

  await prisma.agent.update({ where: { serviceType }, data: { status } });
  await logAdminAction(actor, {
    action: "service.status",
    summary: `${serviceType}: ${agent.status} → ${status}`,
    targetType: "service",
    targetId: serviceType,
  });
  return json({ ok: true, status });
}
