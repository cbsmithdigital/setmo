import { prisma } from "@/lib/db";
import { drawDownUsage } from "@/lib/usage";
import { recomputeRecommendations } from "@/lib/coaching";
import { updateSetterMemory } from "@/lib/memory";
import { recomputeLeaderboards } from "@/lib/leaderboard";
import { uploadRecording } from "@/lib/storage";
import { parsePostCall, extractTranscript } from "@/lib/elevenlabs";
import { scoreTranscript, isScorerConfigured } from "@/lib/scorer";

// Below this, a call is treated as too short to score (accidental hang-ups).
const MIN_SETTER_TURNS = 2;
const MIN_DURATION_SECS = 30;

/**
 * Ingests an authoritative post-call evaluation (server-side only).
 * SetMo scores the call ITSELF from the transcript (Claude) — independent of
 * whether the agent ran its feedback monologue, and works on partial calls.
 * Falls back to parsing the agent's feedback prose when the scorer is off.
 * Idempotent on the session's evaluation. The ONLY path that writes scores.
 */
export async function ingestPostCall(
  rawPayload: unknown
): Promise<{ ok: boolean; sessionId?: string; reason?: string; source?: string }> {
  const parsed = parsePostCall(rawPayload);

  // Resolve the session: prefer our sessionId dynamic variable; fall back to
  // the ElevenLabs conversation id if it was recorded at connect time.
  const session = parsed.sessionId
    ? await prisma.session.findUnique({ where: { id: parsed.sessionId } })
    : parsed.conversationId
      ? await prisma.session.findUnique({
          where: { elevenlabsConversationId: parsed.conversationId },
        })
      : null;

  if (!session) return { ok: false, reason: "no matching session" };

  const duration = parsed.durationSeconds ?? session.durationSeconds ?? 0;

  // Voice coaching: meter the time against the pool, but never score it.
  if (session.kind === "COACH") {
    if (session.status === "COMPLETED") {
      return { ok: true, sessionId: session.id, reason: "already metered" };
    }
    await prisma.session.update({
      where: { id: session.id },
      data: { status: "COMPLETED", completedAt: new Date(), durationSeconds: duration },
    });
    await drawDownUsage(session.officeId, duration);
    return { ok: true, sessionId: session.id, source: "coach-metered" };
  }

  const existing = await prisma.evaluation.findUnique({
    where: { sessionId: session.id },
  });
  if (existing) return { ok: true, sessionId: session.id, reason: "already scored" };

  // --- decide the score source ---
  // Default to the agent's feedback prose (fallback). Prefer SetMo's own
  // transcript scorer when configured and the call is long enough to score.
  let skills = parsed.skills;
  let overall = parsed.overallScore;
  let wins = parsed.wins;
  let misses = parsed.misses;
  let phrases = parsed.phrases;
  let personaCoaching = parsed.personaCoaching;
  let nextScenario = parsed.recommendedNextScenario;
  let narrative = parsed.narrative;
  let source = "agent-feedback";

  const turns = extractTranscript(rawPayload);
  const setterTurns = turns.filter((t) => t.speaker === "you").length;
  const longEnough = setterTurns >= MIN_SETTER_TURNS && duration >= MIN_DURATION_SECS;

  if (isScorerConfigured() && longEnough) {
    const office = await prisma.office.findUnique({ where: { id: session.officeId } });
    const scored = await scoreTranscript({
      turns,
      durationSeconds: duration,
      office: { name: office?.name, city: office?.city, offerFraming: office?.offerFraming },
    });
    if (scored) {
      skills = scored.skills;
      overall = scored.overallScore;
      wins = scored.wins;
      misses = scored.misses;
      phrases = scored.phrases;
      personaCoaching = scored.personaCoaching;
      nextScenario = scored.recommendedNextScenario;
      narrative = scored.narrative ?? parsed.narrative;
      source = "transcript-scorer";
    }
  } else if (!longEnough) {
    // Too short to grade — keep a record but no skill scores (excluded from progress).
    skills = [];
    overall = null;
    source = "too-short";
  }

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: session.id },
      data: {
        status: "SCORED",
        completedAt: new Date(),
        durationSeconds: duration,
        elevenlabsConversationId: parsed.conversationId ?? session.elevenlabsConversationId,
        transcriptRef: session.transcriptRef,
      },
    });

    const evaluation = await tx.evaluation.create({
      data: {
        sessionId: session.id,
        overallScore: overall != null ? overall.toFixed(1) : null,
        narrative,
        wins,
        misses,
        replacementPhrases: phrases,
        personaCoaching,
        recommendedNextScenario: nextScenario,
        rawPayload: rawPayload as object,
      },
    });

    if (skills.length) {
      await tx.skillScore.createMany({
        data: skills.map((s) => ({
          evaluationId: evaluation.id,
          skillKey: s.skillKey,
          tier: s.tier,
          score: s.score.toFixed(1),
          reasoning: s.reasoning,
        })),
      });
    }
  });

  // Draw down the pooled allowance from the authoritative duration.
  await drawDownUsage(session.officeId, duration);

  // Recompute coaching recommendations + roll the setter's memory summary.
  await recomputeRecommendations(session.setterId);
  await updateSetterMemory(session.setterId);

  // Refresh office + global leaderboards (fairness-weighted).
  await recomputeLeaderboards(session.officeId);

  return { ok: true, sessionId: session.id, source };
}

/**
 * Stores the call recording from the ElevenLabs `post_call_audio` webhook.
 * The audio arrives inline (base64) because the account is zero-retention; we
 * persist it to Supabase Storage and reference it on the session. Matched to a
 * session by conversation id (set at /ended or score capture).
 */
export async function ingestAudio(payload: unknown): Promise<{ ok: boolean; reason?: string }> {
  const root = (payload ?? {}) as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const conversationId = (data.conversation_id as string) ?? null;
  const b64 =
    (data.full_audio as string) ?? (data.audio as string) ?? (data.audio_base64 as string) ?? null;
  if (!conversationId || !b64) return { ok: false, reason: "missing conversation id or audio" };

  const session = await prisma.session.findUnique({
    where: { elevenlabsConversationId: conversationId },
  });
  if (!session) return { ok: false, reason: "no matching session for audio" };

  const buffer = Buffer.from(b64, "base64");
  const path = `${session.officeId}/${session.id}.mp3`;
  await uploadRecording(path, buffer);
  await prisma.session.update({ where: { id: session.id }, data: { audioPath: path } });

  return { ok: true };
}
