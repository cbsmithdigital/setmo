import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canStartSession } from "@/lib/usage";
import { error, json } from "@/lib/api";

const Body = z.object({
  serviceType: z.enum(["IMPLANT", "DENTURE", "COSMETIC", "ORTHO", "WISDOM", "GENERAL"]),
  difficulty: z.enum(["ADAPTIVE", "WARM", "TOUGH"]).default("ADAPTIVE"),
});

// POST /api/sessions — create a session row (the bootstrap). The signed
// ElevenLabs URL is minted at /connect when the setter actually starts the call.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (user.role !== "SETTER") return error("Only setters can start practice sessions", 403);
  if (!user.officeId) return error("No office assigned", 400);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request body", 422);
  const { serviceType, difficulty } = parsed.data;

  // The office must offer this service and the agent must be live.
  const [officeService, agent] = await Promise.all([
    prisma.officeService.findUnique({
      where: { officeId_serviceType: { officeId: user.officeId, serviceType } },
    }),
    prisma.agent.findUnique({ where: { serviceType } }),
  ]);
  if (!officeService?.enabled || agent?.status !== "LIVE") {
    return error("That service isn't available for your office yet", 403);
  }

  // No auto-overage: block if the pool is exhausted.
  const allowance = await canStartSession(user.officeId);
  if (!allowance.ok) {
    return error("Your practice pool is used up. Buy a bundle or wait for the reset.", 402);
  }

  // Adaptive difficulty escalates from the setter's memory floor.
  const memory = await prisma.setterMemory.findUnique({ where: { setterId: user.id } });
  const resolvedDifficulty =
    difficulty === "ADAPTIVE" && memory?.difficultyFloor ? memory.difficultyFloor : difficulty;

  const session = await prisma.session.create({
    data: {
      setterId: user.id,
      officeId: user.officeId,
      serviceType,
      agentId: agent.id,
      difficulty,
      status: "CREATED",
      personaSeed: { resolvedDifficulty, hidden: true },
    },
  });

  return json({ sessionId: session.id });
}
