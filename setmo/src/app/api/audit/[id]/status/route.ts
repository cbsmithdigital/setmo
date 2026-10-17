import { prisma } from "@/lib/db";
import { auditCallCounts, finalizeAudit, loadAuditAccess, AUDIT_CALLS } from "@/lib/audit";
import { kickOverdueScore } from "@/lib/rescore";
import { error, json } from "@/lib/api";

// GET /api/audit/:id/status — progress poll for the runner. Returns per-call
// states, the tries left, whether the latest call was too short to score,
// gives an overdue score another try (lib/rescore — one scorer at a time, a few
// tries, then the call is closed out and can be run again), and finalizes the
// report once the call is scored.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditAccess(id);
  if (!audit) return error("Unauthorized", 401);

  const counts = await auditCallCounts(id);

  // A closed-out (FAILED) call is never scored again, so it's left out here.
  const unscored = await prisma.evaluation.findMany({
    where: { session: { auditId: id, status: { not: "FAILED" } }, scoredAt: null },
    select: { sessionId: true },
    take: 2,
  });
  for (const u of unscored) await kickOverdueScore(u.sessionId);

  let status = audit.status;
  if (counts.scored >= AUDIT_CALLS && status !== "SCORED") {
    const done = await finalizeAudit(id);
    if (done) status = done.status;
  }
  return json({
    status,
    scored: counts.scored,
    total: counts.total,
    calls: counts.calls,
    target: AUDIT_CALLS,
    attemptsLeft: counts.attemptsLeft,
    tooShort: counts.tooShort,
  });
}
