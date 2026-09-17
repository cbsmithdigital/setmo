import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { hasPack } from "@/lib/packs/registry";
import { error, json } from "@/lib/api";

const Body = z.object({
  serviceType: z.enum(["IMPLANT", "DENTURE", "COSMETIC", "ORTHO", "WISDOM", "GENERAL"]),
  status: z.enum(["PLANNED", "DRAFT", "LIVE"]),
});

// POST /api/platform/services — roll a call type out (or pull it back).
// Status is what clients see and what session creation gates on, so it lives
// here rather than in the seed file, where a re-seed used to overwrite it.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { serviceType, status } = parsed.data;

  // A service can only go live once it actually has a pack behind it — rubric,
  // lead rules, the lot. Without one, every call would be graded as an implant
  // call against implant personas, which is exactly the denture bug.
  if (status === "LIVE" && !hasPack(serviceType)) {
    return error("That call type has no pack yet — it can't go live.", 409);
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
