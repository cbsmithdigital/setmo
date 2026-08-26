import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canStartSession, canStartCallCenter, callCenterOrgForAgent } from "@/lib/usage";
import { error, json } from "@/lib/api";

const Body = z.object({
  serviceType: z.enum(["IMPLANT", "DENTURE", "COSMETIC", "ORTHO", "WISDOM", "GENERAL"]),
  difficulty: z.enum(["ADAPTIVE", "WARM", "TOUGH"]).default("ADAPTIVE"),
  // Call-center agents pick which served office (account) this call is FOR.
  officeId: z.string().optional(),
});

// POST /api/sessions — create a session row (the bootstrap). The signed
// ElevenLabs URL is minted at /connect when the setter actually starts the call.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request body", 422);
  const { serviceType, difficulty } = parsed.data;

  // Practice is open to every user type (setters, office/group admins, and
  // call-center agents + managers) — they all benefit from repping calls + Setty
  // feedback. We just need a valid office context (whose offer/script the lead
  // uses) and a pool to meter. Call-center users draw the pooled call-center
  // balance; everyone else draws their office pool.
  const isCallCenter = Boolean(user.callCenterPodId) || user.role === "CALL_CENTER_ADMIN";
  let officeId: string;
  let callCenterOrgId: string | null = null;

  if (isCallCenter) {
    const orgId = user.organizationId ?? (await callCenterOrgForAgent(user.id));
    if (!orgId) return error("No call center assigned", 400);
    const target = parsed.data.officeId;
    if (!target) return error("Choose which office you're calling for", 422);
    // Scope: an agent may only call for offices they're assigned; a floor manager
    // for offices their pod serves; a senior for any office in the call center.
    let inScope: boolean;
    if (user.role === "SETTER") {
      inScope = Boolean(await prisma.agentOffice.findUnique({ where: { userId_officeId: { userId: user.id, officeId: target } } }));
    } else if (user.callCenterPodId) {
      inScope = Boolean(await prisma.office.findFirst({ where: { id: target, servedByPodId: user.callCenterPodId }, select: { id: true } }));
    } else {
      inScope = Boolean(await prisma.office.findFirst({ where: { id: target, servedByPod: { organizationId: orgId } }, select: { id: true } }));
    }
    if (!inScope) return error("That office isn't in your call center", 403);
    callCenterOrgId = orgId;
    officeId = target;
  } else {
    // Setter / office admin / group admin: their own office (a group admin with
    // no single office falls back to the org's first office).
    let resolved = user.officeId;
    if (!resolved && user.organizationId) {
      resolved = (await prisma.office.findFirst({ where: { organizationId: user.organizationId }, select: { id: true }, orderBy: { createdAt: "asc" } }))?.id ?? null;
    }
    if (!resolved) return error("No practice office assigned", 400);
    officeId = resolved;
  }

  // The (served) office must offer this service and the agent must be live.
  const [officeService, agent] = await Promise.all([
    prisma.officeService.findUnique({ where: { officeId_serviceType: { officeId, serviceType } } }),
    prisma.agent.findUnique({ where: { serviceType } }),
  ]);
  if (!officeService?.enabled || agent?.status !== "LIVE") {
    return error("That service isn't available for this office yet", 403);
  }

  // No auto-overage: block if the relevant pool is exhausted (call-center pool for
  // agents; the office pool for a normal setter).
  const allowance = callCenterOrgId ? await canStartCallCenter(callCenterOrgId) : await canStartSession(officeId);
  if (!allowance.ok) {
    return error(callCenterOrgId ? "Your call center's practice balance is used up." : "Your practice pool is used up. Buy a bundle or wait for the reset.", 402);
  }

  // Adaptive difficulty escalates from the setter's memory floor.
  const memory = await prisma.setterMemory.findUnique({ where: { setterId: user.id } });
  const resolvedDifficulty =
    difficulty === "ADAPTIVE" && memory?.difficultyFloor ? memory.difficultyFloor : difficulty;

  const session = await prisma.session.create({
    data: {
      setterId: user.id,
      officeId,
      callCenterOrgId, // set for agents → meters the call-center pool, excluded from the office pool
      serviceType,
      agentId: agent.id,
      difficulty,
      status: "CREATED",
      personaSeed: { resolvedDifficulty, hidden: true },
    },
  });

  return json({ sessionId: session.id });
}
