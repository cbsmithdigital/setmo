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
  if (user.role !== "SETTER") return error("Only setters can start practice sessions", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request body", 422);
  const { serviceType, difficulty } = parsed.data;

  // A call-center phone AGENT (setter in a pod) is shared across offices: the
  // served office is chosen per call, and time meters the pooled call-center
  // balance — NOT the served office. A normal single-office setter is unchanged.
  const isAgent = Boolean(user.callCenterPodId);
  let officeId: string;
  let callCenterOrgId: string | null = null;

  if (isAgent) {
    const target = parsed.data.officeId;
    if (!target) return error("Choose which office you're calling for", 422);
    const assigned = await prisma.agentOffice.findUnique({ where: { userId_officeId: { userId: user.id, officeId: target } } });
    if (!assigned) return error("You're not assigned to that office", 403);
    callCenterOrgId = await callCenterOrgForAgent(user.id);
    if (!callCenterOrgId) return error("No call center assigned", 400);
    officeId = target;
  } else {
    if (!user.officeId) return error("No office assigned", 400);
    officeId = user.officeId;
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
