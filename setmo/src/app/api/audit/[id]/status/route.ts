import { loadAuditByCookie } from "@/lib/audit-auth";
import { auditCallCounts, finalizeAudit, AUDIT_CALLS } from "@/lib/audit";
import { error, json } from "@/lib/api";

// GET /api/audit/:id/status — progress poll for the runner. Finalizes the audit
// (computes the report) once all 5 calls are scored.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditByCookie(id);
  if (!audit) return error("Unauthorized", 401);

  const counts = await auditCallCounts(id);
  let status = audit.status;
  if (counts.scored >= AUDIT_CALLS && status !== "SCORED") {
    const done = await finalizeAudit(id);
    if (done) status = done.status;
  }
  return json({ status, scored: counts.scored, total: counts.total, calls: AUDIT_CALLS });
}
