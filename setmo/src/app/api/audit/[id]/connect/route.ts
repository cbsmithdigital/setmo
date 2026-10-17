import { prisma } from "@/lib/db";
import { auditCallCounts, auditCallConnected, loadAuditAccess, AUDIT_CALLS, AUDIT_CALL_MAX_SECONDS, AUDIT_MAX_ATTEMPTS } from "@/lib/audit";
import { agentIdFor, getSignedCall, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { generatePersona, buildLeadPrompt, personaLabel } from "@/lib/personas";
import { captureError } from "@/lib/observability";
import { error, json } from "@/lib/api";

// POST /api/audit/:id/connect — start the prospect's free call. Cookie-gated (no
// Supabase account): creates an is_audit session owned by the prospect user and
// mints the ElevenLabs link. The call only counts once it connects (the browser
// reports that to /live), so a dropped network doesn't use up the free call —
// up to AUDIT_MAX_ATTEMPTS tries. The browser checks the microphone before it
// calls this, so a blocked mic never uses a try.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditAccess(id);
  if (!audit) return error("Unauthorized", 401);
  if (audit.status !== "ACTIVE") return error("This audit isn't active yet.", 403);

  const agentId = agentIdFor("IMPLANT");
  if (!isElevenLabsConfigured() || !agentId) return json({ configured: false, maxSeconds: AUDIT_CALL_MAX_SECONDS });

  const counts = await auditCallCounts(id);
  if (counts.total >= AUDIT_CALLS) return error("Your audit call has already been used.", 409);
  if (counts.attempts >= AUDIT_MAX_ATTEMPTS) {
    return error("You've used all your tries. Email hello@growdental.ai and we'll set you up.", 429, { attemptsLeft: 0 });
  }
  // This try uses one.
  const attemptsLeft = Math.max(0, AUDIT_MAX_ATTEMPTS - counts.attempts - 1);

  const persona = await generatePersona();
  const firstName = audit.contactName.split(/\s+/)[0] ?? "";
  const systemPrompt = buildLeadPrompt(persona, { name: audit.practiceName }, firstName);
  const firstMessage = persona.openingLine;

  // Claim the call under a per-audit lock so two windows can't both start one.
  // An earlier try that never connected is closed out — it never counted.
  const session = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`audit-call:${id}`}))`;
    const open = await tx.session.findMany({
      where: { auditId: id, status: { not: "FAILED" } },
      select: { id: true, personaSeed: true, evaluation: { select: { id: true } } },
    });
    if (open.some((s) => s.evaluation || auditCallConnected(s.personaSeed))) return null;
    if (open.length) await tx.session.updateMany({ where: { id: { in: open.map((s) => s.id) } }, data: { status: "FAILED" } });
    return tx.session.create({
      data: {
        setterId: audit.prospectUserId,
        officeId: audit.officeId,
        serviceType: "IMPLANT",
        kind: "PRACTICE",
        isAudit: true,
        auditId: id,
        difficulty: "ADAPTIVE",
        status: "IN_PROGRESS",
        personaSeed: { audit: true, persona: personaLabel(persona), ...persona },
      },
    });
  });
  if (!session) return error("Your audit call has already been used.", 409);

  // The link, with the conversation id ElevenLabs assigns up front pinned to
  // this session (see lib/ingest). If it can't be had, this try doesn't count.
  let signedUrl: string;
  try {
    const call = await getSignedCall(agentId);
    signedUrl = call.signedUrl;
    if (call.conversationId) await prisma.session.update({ where: { id: session.id }, data: { elevenlabsConversationId: call.conversationId } });
  } catch (e) {
    await prisma.session.update({ where: { id: session.id }, data: { status: "FAILED" } });
    captureError(e, { scope: "audit-connect", auditId: id });
    return error("We couldn't start the call just now — give it a moment and try again.", 502, { attemptsLeft });
  }

  return json({
    configured: true,
    signedUrl,
    sessionId: session.id,
    attemptsLeft,
    dynamicVariables: {
      session_id: session.id,
      setter_id: audit.prospectUserId,
      setter_first_name: firstName,
      office_name: audit.practiceName,
      difficulty: "ADAPTIVE",
    },
    setterId: audit.prospectUserId,
    callNumber: counts.total + 1,
    maxSeconds: AUDIT_CALL_MAX_SECONDS,
    systemPrompt,
    firstMessage,
    voiceId: persona.voice.id,
    personaName: persona.name,
  });
}
