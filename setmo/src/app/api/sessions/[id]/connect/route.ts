import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { agentIdFor, getSignedUrl, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { generatePersona, buildLeadPrompt, personaLabel, type Difficulty } from "@/lib/personas";
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

  // The office is the one this call is FOR (session.officeId) — for a normal
  // setter that's their own office; for a call-center agent it's the chosen
  // served practice, so they role-play with THAT account's offer/script.
  const office = await prisma.office.findUnique({ where: { id: session.officeId }, include: { services: true } });
  const memory = await prisma.setterMemory.findUnique({ where: { setterId: user.id } });
  const enabledServices = (office?.services ?? [])
    .filter((s) => s.enabled)
    .map((s) => s.serviceType)
    .join(", ");

  // Resolve the effective difficulty: an explicit WARM/TOUGH pick is used as-is;
  // ADAPTIVE escalates to the setter's memory floor (rises as they improve). This
  // drives BOTH the persona (skewed objection/tone) and the lead-prompt directive.
  const effectiveDifficulty: Difficulty =
    session.difficulty === "ADAPTIVE" ? (memory?.difficultyFloor ?? "ADAPTIVE") : session.difficulty;

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
    memory_summary: memory?.summary ?? "",
    difficulty: effectiveDifficulty,
  };

  // Compose a fresh lead + matching voice, loaded as overrides so every rep is
  // a different person with a different voice (not the agent's self-randomization).
  // Difficulty shapes how hard this lead is to win over.
  const persona = await generatePersona(effectiveDifficulty);
  const systemPrompt = buildLeadPrompt(persona, office ?? {}, user.firstName, effectiveDifficulty);
  const firstMessage = persona.openingLine;

  await prisma.session.update({
    where: { id: session.id },
    data: {
      status: "IN_PROGRESS",
      startedAt: new Date(),
      personaSeed: { persona: personaLabel(persona), resolvedDifficulty: effectiveDifficulty, ...persona },
    },
  });

  if (!isElevenLabsConfigured()) {
    return json({ configured: false, dynamicVariables });
  }

  const agentId = agentIdFor(session.serviceType as ServiceKey);
  if (!agentId) {
    return json({ configured: false, dynamicVariables, reason: "agent id not set" });
  }

  try {
    const signedUrl = await getSignedUrl(agentId);
    return json({
      configured: true,
      signedUrl,
      dynamicVariables,
      setterId: user.id,
      systemPrompt,
      firstMessage,
      voiceId: persona.voice.id,
      personaName: persona.name,
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Failed to start conversation", 502);
  }
}
