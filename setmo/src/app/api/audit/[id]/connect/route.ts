import { prisma } from "@/lib/db";
import { loadAuditByCookie } from "@/lib/audit-auth";
import { auditCallCounts, AUDIT_CALLS, AUDIT_CALL_MAX_SECONDS } from "@/lib/audit";
import { agentIdFor, getSignedUrl, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { generatePersona, buildLeadPrompt, personaLabel } from "@/lib/personas";
import { error, json } from "@/lib/api";

// POST /api/audit/:id/connect — bootstrap one of the (up to 5) audit calls.
// Cookie-gated (no Supabase account); creates an is_audit session owned by the
// prospect user and mints the ElevenLabs signed URL.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditByCookie(id);
  if (!audit) return error("Unauthorized", 401);
  if (audit.status !== "ACTIVE") return error("This audit isn't active yet.", 403);

  const counts = await auditCallCounts(id);
  if (counts.total >= AUDIT_CALLS) return error("All 5 audit calls have been used.", 409);

  const persona = await generatePersona();
  const firstName = audit.contactName.split(/\s+/)[0] ?? "";
  const systemPrompt = buildLeadPrompt(persona, { name: audit.practiceName }, firstName);
  const firstMessage = persona.openingLine;

  const session = await prisma.session.create({
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

  const dynamicVariables: Record<string, string> = {
    session_id: session.id,
    setter_id: audit.prospectUserId,
    setter_first_name: firstName,
    office_name: audit.practiceName,
    difficulty: "ADAPTIVE",
  };

  const agentId = agentIdFor("IMPLANT");
  if (!isElevenLabsConfigured() || !agentId) {
    return json({ configured: false, dynamicVariables, maxSeconds: AUDIT_CALL_MAX_SECONDS });
  }

  try {
    const signedUrl = await getSignedUrl(agentId);
    return json({
      configured: true,
      signedUrl,
      dynamicVariables,
      setterId: audit.prospectUserId,
      callNumber: counts.total + 1,
      maxSeconds: AUDIT_CALL_MAX_SECONDS,
      systemPrompt,
      firstMessage,
      voiceId: persona.voice.id,
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't start the call", 502);
  }
}
