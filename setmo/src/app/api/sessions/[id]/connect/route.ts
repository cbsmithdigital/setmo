import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { agentIdFor, getSignedUrl, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { memoryForService } from "@/lib/memory";
import { buildSessionLead, hasComposedLead, resolveDifficulty } from "@/lib/session-lead";
import { error, json } from "@/lib/api";
import type { ServiceKey } from "@/generated/prisma/client";

// POST /api/sessions/:id/connect — server bootstrap: mint a fresh signed URL
// and the dynamic-variable overrides the agent role-plays with. Returns the
// config for the browser SDK to start the conversation. The lead itself was
// normally composed already (/prepare, for the lead card) and is reused as-is.
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
  // A lead has actually been composed for this session: either the implant
  // generator's persona (has a name) or a pack lead (has its skeleton).
  const hasLead = hasComposedLead(session.personaSeed);
  // Only a call that was claimed but never got going (mic blocked, network) is
  // retried on the same session. One that connected and then dropped is called
  // back as a NEW session (/retry) — reconnecting it would let the dropped call's
  // transcript arrive mid-redial and score the session out from under it.
  const connectedBefore = Boolean((session.personaSeed as Record<string, unknown> | null)?.connectedAt);
  const isReconnect =
    session.status === "IN_PROGRESS" &&
    !session.elevenlabsConversationId &&
    !connectedBefore &&
    !session.completedAt && // the browser already reported this call as ended
    hasLead &&
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
  // drives BOTH the persona (skewed objection/tone) and the lead-prompt directive,
  // and was fixed when the session was created, so the lead card, the call and a
  // reconnect all play at the same level.
  const effectiveDifficulty = await resolveDifficulty(session);

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

  // The lead + matching voice, loaded as overrides so every rep is a different
  // person with a different voice (not the agent's self-randomization). It was
  // normally composed for the lead card already; a session opened by an older
  // screen (or whose card failed to load) composes it here instead.
  //
  // Services with their own pack use the lead engine — facts sampled in code
  // from compatible options only, then checked. Implant keeps its own generator.
  const leadInputs = { office: office ?? {}, setterFirstName: user.firstName, difficulty: effectiveDifficulty };
  let { lead, seedToStore } = await buildSessionLead({ session, ...leadInputs });

  // The voice link first: if it can't be had, the session is left exactly as it
  // was (not stranded as a started call that never was).
  let signedUrl: string;
  try {
    signedUrl = await getSignedUrl(agentId);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Failed to start conversation", 502);
  }

  if (!isReconnect) {
    // Start the call only if nothing changed underneath: a lead composed HERE
    // may only be saved while the session still has none, so it can never
    // replace a lead card the setter is already looking at.
    const claimed = await prisma.session.updateMany({
      where: { id: session.id, status: "CREATED", ...(hasLead ? {} : { personaSeed: { path: ["hidden"], equals: true } }) },
      data: { status: "IN_PROGRESS", startedAt: new Date(), personaSeed: seedToStore as object },
    });
    if (claimed.count === 0) {
      // The lead card was saved meanwhile (or another tab started the call):
      // go with the saved lead.
      const fresh = await prisma.session.findUnique({ where: { id: session.id } });
      if (!fresh || fresh.status !== "CREATED" || !hasComposedLead(fresh.personaSeed)) {
        return error("This call already started.", 409);
      }
      ({ lead, seedToStore } = await buildSessionLead({ session: fresh, ...leadInputs }));
      const retried = await prisma.session.updateMany({
        where: { id: session.id, status: "CREATED" },
        data: { status: "IN_PROGRESS", startedAt: new Date(), personaSeed: seedToStore as object },
      });
      if (retried.count === 0) return error("This call already started.", 409);
    }
  }

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
}
