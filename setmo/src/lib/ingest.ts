import { prisma } from "@/lib/db";
import { recomputeRecommendations } from "@/lib/coaching";
import { updateSetterMemory } from "@/lib/memory";
import { recomputeLeaderboards } from "@/lib/leaderboard";
import { evaluateGoalsForSetter } from "@/lib/goals";
import { evaluateMinuteThresholds } from "@/lib/usage";
import { uploadRecording } from "@/lib/storage";
import { parsePostCall, extractTranscript } from "@/lib/elevenlabs";
import { scoreTranscript, isScorerConfigured } from "@/lib/scorer";

// Below this, a call is treated as too short to score (hang-ups / interruptions).
// Under a minute is excluded from scoring + averages.
const MIN_SETTER_TURNS = 2;
const MIN_DURATION_SECS = 60;

/**
 * CAPTURE (fast, runs inline in the webhook). Resolves the session and persists
 * the raw transcript immediately — BEFORE any scoring — so the one webhook we get
 * is never lost (zero-retention account). Scoring is deferred to scoreSession(),
 * which runs in the background. Returns needsScore so the caller can kick it off.
 */
export async function ingestPostCall(
  rawPayload: unknown
): Promise<{ ok: boolean; sessionId?: string; reason?: string; needsScore?: boolean; kind?: string }> {
  const parsed = parsePostCall(rawPayload);

  const session = parsed.sessionId
    ? await prisma.session.findUnique({ where: { id: parsed.sessionId } })
    : parsed.conversationId
      ? await prisma.session.findUnique({ where: { elevenlabsConversationId: parsed.conversationId } })
      : null;

  if (!session) return { ok: false, reason: "no matching session" };

  const duration = parsed.durationSeconds ?? session.durationSeconds ?? 0;

  // Voice coaching: meter the time against the pool, never score it.
  if (session.kind === "COACH") {
    if (session.status === "COMPLETED") return { ok: true, sessionId: session.id, reason: "already metered" };
    await prisma.session.update({
      where: { id: session.id },
      data: { status: "COMPLETED", completedAt: new Date(), durationSeconds: duration },
    });
    return { ok: true, sessionId: session.id, kind: "coach" };
  }

  const existing = await prisma.evaluation.findUnique({ where: { sessionId: session.id } });
  if (existing?.scoredAt) return { ok: true, sessionId: session.id, reason: "already scored" };

  // Persist the raw transcript on the evaluation row (no scores yet).
  if (existing) {
    await prisma.evaluation.update({ where: { sessionId: session.id }, data: { rawPayload: rawPayload as object } });
  } else {
    await prisma.evaluation.create({ data: { sessionId: session.id, rawPayload: rawPayload as object } });
  }
  await prisma.session.update({
    where: { id: session.id },
    data: {
      durationSeconds: duration,
      completedAt: new Date(),
      elevenlabsConversationId: parsed.conversationId ?? session.elevenlabsConversationId,
    },
  });

  return { ok: true, sessionId: session.id, needsScore: true };
}

/**
 * SCORE (deferred, runs in the background — can take 30–150s). Reads the captured
 * transcript, runs the Claude scorer (or prose fallback), writes the evaluation +
 * skills, stamps scoredAt, and runs the post-score side effects. Idempotent on
 * scoredAt, so retries / a re-score sweep just no-op once it's done.
 */
export async function scoreSession(
  sessionId: string
): Promise<{ ok: boolean; reason?: string; source?: string }> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) return { ok: false, reason: "no session" };

  const evaluation = await prisma.evaluation.findUnique({ where: { sessionId }, include: { skills: true } });
  if (!evaluation?.rawPayload) return { ok: false, reason: "no captured transcript" };
  if (evaluation.scoredAt) return { ok: true, reason: "already scored" };

  const rawPayload = evaluation.rawPayload;
  const parsed = parsePostCall(rawPayload);
  const duration = session.durationSeconds ?? parsed.durationSeconds ?? 0;

  // Default to the agent's feedback prose; prefer SetMo's transcript scorer.
  let skills = parsed.skills;
  let overall = parsed.overallScore;
  let wins = parsed.wins;
  let misses = parsed.misses;
  let phrases = parsed.phrases;
  let personaCoaching = parsed.personaCoaching;
  let nextScenario = parsed.recommendedNextScenario;
  let narrative = parsed.narrative;
  let booked: boolean | null = null;
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
      booked = scored.booked;
      source = "transcript-scorer";
    }
  } else if (!longEnough) {
    skills = [];
    overall = null;
    source = "too-short";
  }

  await prisma.$transaction(async (tx) => {
    await tx.session.update({ where: { id: session.id }, data: { status: "SCORED" } });
    await tx.evaluation.update({
      where: { sessionId: session.id },
      data: {
        overallScore: overall != null ? overall.toFixed(1) : null,
        narrative,
        wins,
        misses,
        replacementPhrases: phrases,
        personaCoaching,
        recommendedNextScenario: nextScenario,
        booked,
        scoredAt: new Date(),
      },
    });
    await tx.skillScore.deleteMany({ where: { evaluationId: evaluation.id } });
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

  // Setter Audit calls are scored, but never draw down a pool, drive
  // recommendations, or hit a leaderboard (the prospect isn't a customer).
  if (session.isAudit) return { ok: true, source: source + "-audit" };

  await recomputeRecommendations(session.setterId);
  await updateSetterMemory(session.setterId);
  await recomputeLeaderboards(session.officeId);
  // refresh any active goals this call could move (the setter's + their team's)
  await evaluateGoalsForSetter(session.setterId).catch(() => {});
  // this call drew down minutes — fire low-balance alerts / auto top-up if needed
  await evaluateMinuteThresholds(session.officeId).catch(() => {});

  return { ok: true, source };
}

/**
 * Stores the call recording from the ElevenLabs `post_call_audio` webhook.
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
