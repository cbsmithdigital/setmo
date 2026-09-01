import { prisma } from "@/lib/db";
import { LIVE_TRANSCRIPT_RETENTION_DAYS } from "@/lib/ghl";
import { json, error } from "@/lib/api";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/cron/ghl-retention — daily PII-retention sweep for live calls: after
// the retention window, purge the scrubbed transcript text (Evaluation.rawPayload
// on LIVE sessions + the stored webhook payloads). Scores, skills, and the
// outcome analysis are kept forever — only the words are dropped.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return error("Unauthorized", 401);
  }

  const cutoff = new Date(Date.now() - LIVE_TRANSCRIPT_RETENTION_DAYS * 86400_000);

  // NB: Prisma's Json `not` is a literal-value comparison (no nested filters),
  // so already-purged rows are excluded in JS — otherwise every old evaluation
  // would re-match nightly and the sweep would grow without bound.
  const candidates = await prisma.evaluation.findMany({
    where: { session: { kind: "LIVE", startedAt: { lt: cutoff } } },
    select: { id: true, rawPayload: true },
  });
  const stale = candidates.filter((e) => {
    const p = e.rawPayload as { purged?: boolean } | null;
    return p != null && p.purged !== true;
  });
  for (const e of stale) {
    await prisma.evaluation.update({ where: { id: e.id }, data: { rawPayload: { purged: true, purgedAt: new Date().toISOString() } } });
  }

  const eventCandidates = await prisma.ghlInboundEvent.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, payload: true },
  });
  const staleEvents = eventCandidates.filter((e) => (e.payload as { purged?: boolean } | null)?.purged !== true);
  for (const e of staleEvents) {
    await prisma.ghlInboundEvent.update({ where: { id: e.id }, data: { payload: { purged: true } } });
  }

  return json({ ok: true, transcriptsPurged: stale.length, eventsPurged: staleEvents.length, retentionDays: LIVE_TRANSCRIPT_RETENTION_DAYS });
}
