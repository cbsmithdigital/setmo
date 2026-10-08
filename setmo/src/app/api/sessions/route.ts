import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { callCenterOrgForAgent } from "@/lib/usage";
import { memoryForService } from "@/lib/memory";
import { callCenterOfficeInScope, checkPracticeOpen } from "@/lib/practice-access";
import { leadChoiceLabel, validateLeadChoice } from "@/lib/lead-choice";
import { error, json } from "@/lib/api";

const Body = z.object({
  serviceType: z.enum(["IMPLANT", "DENTURE", "COSMETIC", "ORTHO", "WISDOM", "GENERAL"]),
  difficulty: z.enum(["ADAPTIVE", "WARM", "TOUGH"]).default("ADAPTIVE"),
  // Call-center agents pick which served office (account) this call is FOR.
  officeId: z.string().optional(),
  // "Pick your lead" — omitted (or empty) means surprise me.
  choice: z.unknown().optional(),
});

// POST /api/sessions — create a session row (the bootstrap). The signed
// ElevenLabs URL is minted at /connect when the setter actually starts the call.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request body", 422);
  const { serviceType, difficulty } = parsed.data;
  let choice: ReturnType<typeof validateLeadChoice>;
  try {
    choice = validateLeadChoice(serviceType, parsed.data.choice);
  } catch (e) {
    return error(e instanceof Error ? e.message : "That lead choice isn't valid.", 422);
  }

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
    if (!(await callCenterOfficeInScope(user, orgId, target))) return error("That office isn't in your call center", 403);
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

  // The (served) office must offer this call type, the call type must be open
  // (LIVE for everyone, or BETA for the offices piloting it), and the pool the
  // call draws must have time left.
  const access = await checkPracticeOpen({ officeId, serviceType, callCenterOrgId });
  if (!access.ok) return error(access.error, access.code);

  // Adaptive difficulty escalates from the setter's memory floor FOR THIS
  // SERVICE (connect resolves it the same way).
  const memoryRow = await prisma.setterMemory.findUnique({ where: { setterId: user.id } });
  const resolvedDifficulty =
    difficulty === "ADAPTIVE" ? memoryForService(memoryRow, serviceType).difficultyFloor : difficulty;

  const session = await prisma.session.create({
    data: {
      setterId: user.id,
      officeId,
      callCenterOrgId, // set for agents → meters the call-center pool, excluded from the office pool
      serviceType,
      agentId: access.agentId,
      difficulty,
      status: "CREATED",
      personaSeed: {
        resolvedDifficulty,
        hidden: true,
        ...(choice ? { choice, choiceLabel: leadChoiceLabel(serviceType, choice) } : {}),
      },
    },
  });

  return json({ sessionId: session.id });
}
