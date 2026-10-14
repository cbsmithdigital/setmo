import { prisma } from "@/lib/db";
import { loadAuditByCookie } from "@/lib/audit-auth";
import { auditCallCounts, finalizeAudit, AUDIT_CALLS } from "@/lib/audit";
import { kickOverdueScore } from "@/lib/rescore";
import { error, json } from "@/lib/api";

// GET /api/audit/:id/status — progress poll for the runner. Returns per-call
// states, gives an overdue score another try (lib/rescore — one scorer at a
// time, a few tries, then the call is closed out and can be run again), and
// finalizes the report once the call is scored.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditByCookie(id);
  if (!audit) return error("Unauthorized", 401);

  const counts = await auditCallCounts(id);

  const unscored = await prisma.evaluation.findMany({
    where: { session: { auditId: id }, scoredAt: null },
    select: { sessionId: true },
    take: 2,
  });
  for (const u of unscored) await kickOverdueScore(u.sessionId);

  let status = audit.status;
  if (counts.scored >= AUDIT_CALLS && status !== "SCORED") {
    const done = await finalizeAudit(id);
    if (done) status = done.status;
  }
  return json({ status, scored: counts.scored, total: counts.total, calls: counts.calls, target: AUDIT_CALLS });
}
