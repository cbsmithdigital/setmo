import { prisma } from "@/lib/db";
import { drawDownUsage } from "@/lib/usage";
import { recomputeRecommendations } from "@/lib/coaching";
import { updateSetterMemory } from "@/lib/memory";
import { recomputeLeaderboards } from "@/lib/leaderboard";
import type { ParsedEvaluation } from "@/lib/elevenlabs";

/**
 * Ingests an authoritative post-call evaluation (server-side only).
 * Idempotent: re-running for a session that's already scored is a no-op.
 * In production the webhook enqueues this onto Trigger.dev; for v1 it runs
 * inline. Either way this is the ONLY path that writes scores + durations.
 */
export async function ingestPostCall(
  parsed: ParsedEvaluation,
  rawPayload: unknown
): Promise<{ ok: boolean; sessionId?: string; reason?: string }> {
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

  const existing = await prisma.evaluation.findUnique({
    where: { sessionId: session.id },
  });
  if (existing) return { ok: true, sessionId: session.id, reason: "already scored" };

  const duration = parsed.durationSeconds ?? session.durationSeconds ?? 0;

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
        overallScore: parsed.overallScore != null ? parsed.overallScore.toFixed(1) : null,
        narrative: parsed.narrative,
        wins: parsed.wins,
        misses: parsed.misses,
        replacementPhrases: parsed.phrases,
        personaCoaching: parsed.personaCoaching,
        recommendedNextScenario: parsed.recommendedNextScenario,
        rawPayload: rawPayload as object,
      },
    });

    if (parsed.skills.length) {
      await tx.skillScore.createMany({
        data: parsed.skills.map((s) => ({
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

  return { ok: true, sessionId: session.id };
}
