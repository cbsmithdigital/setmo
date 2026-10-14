import { after } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { scoreSession, SCORE_LEASE_MS } from "@/lib/ingest";
import { captureError } from "@/lib/observability";

// Practice calls whose score didn't land. The post-call webhook scores in the
// background once; if that dies (function cut off, Claude erroring past its
// retries) the call would otherwise sit unscored forever while its minutes
// still count. The sweep (cron every 5 minutes) and the polls retry it; after
// MAX_SCORE_ATTEMPTS the call is marked FAILED, which takes it out of the
// balance (lib/usage) and tells the setter it didn't score.

export const MAX_SCORE_ATTEMPTS = 3;
// Leave the webhook's own background scoring a head start before retrying.
const RETRY_AFTER_MS = 3 * 60_000;
// The longest call is 30 minutes (the agent's cap); past this with no
// transcript, the post-call webhook isn't coming (the account keeps nothing).
const NO_TRANSCRIPT_AFTER_MS = 45 * 60_000;

export type FailReason = "scoring" | "no-transcript";

/** Mark a call FAILED so it stops waiting, isn't charged, and says why. */
export async function markCallFailed(sessionId: string, reason: FailReason): Promise<void> {
  const s = await prisma.session.findUnique({ where: { id: sessionId }, select: { status: true, personaSeed: true } });
  if (!s || s.status === "SCORED" || s.status === "FAILED") return;
  const seed = (s.personaSeed ?? {}) as Record<string, unknown>;
  await prisma.session.updateMany({
    where: { id: sessionId, status: { notIn: ["SCORED", "FAILED"] } },
    data: { status: "FAILED", personaSeed: { ...seed, failReason: reason, failedAt: new Date().toISOString() } as object },
  });
}

const dueForRetry = (now: number): Prisma.EvaluationWhereInput => ({
  scoredAt: null,
  rawPayload: { not: Prisma.DbNull },
  createdAt: { lt: new Date(now - RETRY_AFTER_MS) },
  scoreAttempts: { lt: MAX_SCORE_ATTEMPTS },
  OR: [{ scoringStartedAt: null }, { scoringStartedAt: { lt: new Date(now - SCORE_LEASE_MS) } }],
  session: { kind: "PRACTICE", status: { not: "FAILED" } },
});

/**
 * From a poll (results page, audit runner): if this call's score is overdue and
 * nobody is scoring it, score it again in the background. Cheap when there's
 * nothing to do; the lease in scoreSession keeps two pollers from both running it.
 */
export async function kickOverdueScore(sessionId: string): Promise<void> {
  const due = await prisma.evaluation.findFirst({ where: { sessionId, ...dueForRetry(Date.now()) }, select: { sessionId: true } });
  if (!due) return;
  after(async () => {
    try {
      await scoreSession(sessionId);
    } catch (e) {
      captureError(e, { scope: "rescore-kick", sessionId });
    }
  });
}

/** The 5-minute sweep. Retries overdue scores within a time budget, then closes
 *  out calls that are out of tries or whose transcript never arrived. */
export async function sweepScoring(budgetMs = 230_000): Promise<{ retried: number; scored: number; failedScoring: number; failedNoTranscript: number }> {
  const started = Date.now();
  let retried = 0;
  let scored = 0;

  const due = await prisma.evaluation.findMany({
    where: dueForRetry(started),
    select: { sessionId: true },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  for (const d of due) {
    if (Date.now() - started > budgetMs) break;
    retried++;
    try {
      const r = await scoreSession(d.sessionId);
      if (r.ok) scored++;
    } catch (e) {
      captureError(e, { scope: "rescore-sweep", sessionId: d.sessionId });
    }
  }

  // Out of tries (and nobody mid-attempt): stop the spinner, don't charge it.
  const now = Date.now();
  const exhausted = await prisma.evaluation.findMany({
    where: {
      scoredAt: null,
      scoreAttempts: { gte: MAX_SCORE_ATTEMPTS },
      OR: [{ scoringStartedAt: null }, { scoringStartedAt: { lt: new Date(now - SCORE_LEASE_MS) } }],
      session: { kind: "PRACTICE", status: { notIn: ["SCORED", "FAILED"] } },
    },
    select: { sessionId: true, scoreError: true },
  });
  for (const e of exhausted) {
    await markCallFailed(e.sessionId, "scoring");
    captureError(new Error(`Call could not be scored after ${MAX_SCORE_ATTEMPTS} tries`), { scope: "rescore-failed", sessionId: e.sessionId, lastError: e.scoreError });
  }

  // Started but no transcript ever arrived: nothing to score or charge.
  const lost = await prisma.session.findMany({
    where: { status: "IN_PROGRESS", kind: { in: ["PRACTICE", "COACH"] }, startedAt: { lt: new Date(now - NO_TRANSCRIPT_AFTER_MS) }, evaluation: null },
    select: { id: true },
    take: 200,
  });
  for (const s of lost) await markCallFailed(s.id, "no-transcript");

  return { retried, scored, failedScoring: exhausted.length, failedNoTranscript: lost.length };
}
