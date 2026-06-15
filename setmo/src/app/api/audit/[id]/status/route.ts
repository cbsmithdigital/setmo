import { after } from "next/server";
import { prisma } from "@/lib/db";
import { loadAuditByCookie } from "@/lib/audit-auth";
import { auditCallCounts, finalizeAudit, AUDIT_CALLS } from "@/lib/audit";
import { scoreSession } from "@/lib/ingest";
import { error, json } from "@/lib/api";

// GET /api/audit/:id/status — progress poll for the runner. Returns per-call
// states, recovers any call whose transcript was captured but never scored
// (re-runs scoring in the background), and finalizes once all 5 are scored.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditByCookie(id);
  if (!audit) return error("Unauthorized", 401);

  const counts = await auditCallCounts(id);

  // Recovery: if a transcript was captured but the background score didn't land
  // (function killed, transient error), re-trigger it. Gate on age so we don't
  // stampede a score that's still in flight (normal scoring finishes <60s).
  const stuck = await prisma.evaluation.findMany({
    where: { session: { auditId: id }, scoredAt: null, createdAt: { lt: new Date(Date.now() - 90_000) } },
    select: { sessionId: true },
    take: 2,
  });
  for (const s of stuck) {
    after(async () => {
      try {
        await scoreSession(s.sessionId);
      } catch (e) {
        console.error("audit re-score failed", s.sessionId, e);
      }
    });
  }

  let status = audit.status;
  if (counts.scored >= AUDIT_CALLS && status !== "SCORED") {
    const done = await finalizeAudit(id);
    if (done) status = done.status;
  }
  return json({ status, scored: counts.scored, total: counts.total, calls: counts.calls, target: AUDIT_CALLS });
}
