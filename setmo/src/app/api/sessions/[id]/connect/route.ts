import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { agentIdFor, getSignedUrl, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { type Difficulty } from "@/lib/personas";
import { memoryForService } from "@/lib/memory";
import { packFor } from "@/lib/packs/registry";
import { buildImplantLead, buildPackLead } from "@/lib/realism/build-lead";
import { error, json } from "@/lib/api";
import type { ServiceKey } from "@/generated/prisma/client";

// POST /api/sessions/:id/connect — server bootstrap: mint a fresh signed URL
// and the dynamic-variable overrides the agent role-plays with. Returns the
// config for the browser SDK to start the conversation.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const { id } = await params;
  const session = await prisma.session.findFirst({
    where: { id, setterId: user.id },
  });
  if (!session) return error("Session not found", 404);

  // A finished call is never reopened (that used to strand a SCORED session back
  // in IN_PROGRESS). A call already under way may only reconnect — the browser
  // dropped the mic or the socket — and then it reuses the SAME lead, so the
  // setter can't reroll a persona by reloading.
  if (session.status === "SCORED" || session.status === "COMPLETED" || session.status === "FAILED") {
    return error("This call is already finished.", 409);
  }
  // Long enough to cover a drop late in a long call, short enough that an
  // abandoned session can't be picked up later as a free second call.
  const RECONNECT_WINDOW_MS = 30 * 60 * 1000;
  const seed = session.personaSeed as Record<string, unknown> | null;
  const isReconnect =
    session.status === "IN_PROGRESS" &&
    !session.elevenlabsConversationId &&
    !session.completedAt && // the browser already reported this call as ended
    Boolean(seed && seed.hidden !== true && typeof seed.name === "string") &&
    Date.now() - session.startedAt.getTime() < RECONNECT_WINDOW_MS;
  if (session.status === "IN_PROGRESS" && !isReconnect) {
    return error("This call already started.", 409);
  }

  // The office is the one this call is FOR (session.officeId) — for a normal
  // setter that's their own office; for a call-center agent it's the chosen
  // served practice, so they role-play with THAT account's offer/script.
  const office = await prisma.office.findUnique({ where: { id: session.officeId }, include: { services: true } });
  const memoryRow = await prisma.setterMemory.findUnique({ where: { setterId: user.id } });
  // Difficulty and continuity are per service — an implant veteran starts fresh
  // on their first emergency call.
  const memory = memoryForService(memoryRow, session.serviceType);
  const enabledServices = (office?.services ?? [])
    .filter((s) => s.enabled)
    .map((s) => s.serviceType)
    .join(", ");

  // Resolve the effective difficulty: an explicit WARM/TOUGH pick is used as-is;
  // ADAPTIVE escalates to the setter's memory floor (rises as they improve). This
  // drives BOTH the persona (skewed objection/tone) and the lead-prompt directive.
  const effectiveDifficulty: Difficulty =
    session.difficulty === "ADAPTIVE" ? memory.difficultyFloor : session.difficulty;

  // Server-built overrides (the office + setter context the agent role-plays with).
  const dynamicVariables: Record<string, string> = {
    session_id: session.id,
    setter_id: user.id,
    setter_first_name: user.firstName ?? "",
    office_name: office?.name ?? "",
    office_city: office?.city ?? "",
    offer_framing: office?.offerFraming ?? "",
    appointment_framing: office?.appointmentFraming ?? "",
    deposit_policy: office?.depositPolicy ?? "",
    allowed_services: enabledServices,
    memory_summary: memory.summary ?? "",
    difficulty: effectiveDifficulty,
  };

  // Resolve the voice agent BEFORE composing a lead or touching the session, so a
  // service with no agent wired up can't burn a persona call or strand the
  // session half-started (that's how the orphaned denture session happened).
  if (!isElevenLabsConfigured()) {
    return json({ configured: false, dynamicVariables });
  }
  const agentId = agentIdFor(session.serviceType as ServiceKey);
  if (!agentId) {
    return json({ configured: false, dynamicVariables, reason: "agent id not set" });
  }

  // Compose a fresh lead + matching voice, loaded as overrides so every rep is
  // a different person with a different voice (not the agent's self-randomization).
  // Difficulty shapes how hard this lead is to win over. A reconnect reuses the
  // lead already composed for this session.
  //
  // Services with their own pack use the lead engine — facts sampled in code
  // from compatible options only, then checked. Implant keeps the original
  // generator, untouched.
  const pack = packFor(session.serviceType);
  const lead = pack?.persona
    ? await buildPackLead({
        pack,
        seed: session.id,
        difficulty: effectiveDifficulty,
        office: office ?? {},
        setterFirstName: user.firstName,
        stored: isReconnect ? (seed as Record<string, unknown>) : null,
      })
    : await buildImplantLead({
        difficulty: effectiveDifficulty,
        office: office ?? {},
        setterFirstName: user.firstName,
        stored: isReconnect ? (seed as Record<string, unknown>) : null,
      });

  if (!isReconnect) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        personaSeed: { ...lead.seed, resolvedDifficulty: effectiveDifficulty },
      },
    });
  }

  try {
    const signedUrl = await getSignedUrl(agentId);
    return json({
      configured: true,
      signedUrl,
      dynamicVariables,
      setterId: user.id,
      systemPrompt: lead.systemPrompt,
      firstMessage: lead.firstMessage,
      voiceId: lead.voiceId,
      personaName: lead.personaName,
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Failed to start conversation", 502);
  }
}
