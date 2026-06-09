import { prisma } from "@/lib/db";
import { drawDownUsage } from "@/lib/usage";
import { recomputeRecommendations } from "@/lib/coaching";
import { updateSetterMemory } from "@/lib/memory";
import { recomputeLeaderboards } from "@/lib/leaderboard";
import { uploadRecording } from "@/lib/storage";
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
