import { prisma } from "@/lib/db";
import type { ServiceKey } from "@/generated/prisma/client";

// Fairness-weighted leaderboards: ranked on AVERAGE score, never raw session
// volume, so high-volume practices don't auto-win. Materialized into
// leaderboard_entry. An office's own board is recomputed after each of its
// scored calls; the platform-wide board on a 15-minute cron (it spans every
// customer, so rebuilding it per call would slow scoring as volume grows).
// The averaging happens in the database — one row per setter or office comes
// back, not every call.

function periodKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DEFAULT_SERVICE: ServiceKey = "IMPLANT";

/** Office scope: rank the office's own setters by average score. Call-center
 *  agents practise FOR this office but belong to the call center, so they're
 *  ranked on their own center's boards, not against the practice's staff. */
export async function recomputeOfficeLeaderboard(
  officeId: string,
  serviceType: ServiceKey = DEFAULT_SERVICE
): Promise<void> {
  const ranked = await prisma.$queryRaw<{ subjectId: string; value: number }[]>`
    SELECT s.setter_id AS "subjectId", AVG(e.overall_score)::float8 AS value
      FROM session s JOIN evaluation e ON e.session_id = s.id
     WHERE s.office_id = ${officeId}
       AND s.service_type::text = ${serviceType}
       AND s.kind::text = 'PRACTICE' AND s.status::text = 'SCORED'
       AND NOT s.is_audit AND s.call_center_org_id IS NULL
       AND e.overall_score IS NOT NULL
     GROUP BY s.setter_id
     ORDER BY value DESC`;
  await materialize("OFFICE", "SETTER", serviceType, ranked, { officeId });
}

/** Global scope: rank offices by their average score (privacy-respecting; the
 *  board names only the viewer's own practice, see getGlobalLeaderboard).
 *  Only current clients rank: Practice Access on, or a renewal Stripe is still
 *  retrying (the same rule as accessState in usage.ts), so an office that never
 *  activated or has lapsed drops off. Excluded: audit calls and prospect offices
 *  (a stranger's trial call has no place on a customer board), and call-center
 *  agent calls — those are the call center's reps, and crediting them to the
 *  served practice would publish practices that have no SetMo users of their
 *  own. Demo / test accounts (the office or its organization) never rank against
 *  customers (see getGlobalLeaderboard for the demo-only board their own users
 *  see instead). */
export async function recomputeGlobalLeaderboard(
  serviceType: ServiceKey = DEFAULT_SERVICE
): Promise<void> {
  const ranked = await prisma.$queryRaw<{ subjectId: string; value: number }[]>`
    SELECT s.office_id AS "subjectId", AVG(e.overall_score)::float8 AS value
      FROM session s
      JOIN evaluation e ON e.session_id = s.id
      JOIN office o ON o.id = s.office_id
      JOIN subscription sub ON sub.office_id = o.id
      LEFT JOIN organization g ON g.id = o.organization_id
     WHERE s.service_type::text = ${serviceType}
       AND s.kind::text = 'PRACTICE' AND s.status::text = 'SCORED'
       AND NOT s.is_audit AND s.call_center_org_id IS NULL
       AND NOT o.is_prospect AND NOT o.is_demo AND NOT COALESCE(g.is_demo, false)
       AND sub.status::text IN ('ACTIVE', 'PAST_DUE')
       AND e.overall_score IS NOT NULL
     GROUP BY s.office_id
     ORDER BY value DESC`;
  await materialize("GLOBAL", "OFFICE", serviceType, ranked);
}

/** After a scored call: the office's own board. (The global board is the cron's.) */
export async function recomputeLeaderboards(officeId: string): Promise<void> {
  await recomputeOfficeLeaderboard(officeId);
}

// Replace the materialized rows for a scope, carrying rank movement forward.
// Under a per-scope lock, so two rebuilds at once can't both delete and then
// both insert (duplicate rows).
async function materialize(
  scope: "OFFICE" | "GLOBAL",
  subjectType: "SETTER" | "OFFICE" | "GROUP",
  serviceType: ServiceKey,
  ranked: { subjectId: string; value: number }[],
  opts: { officeId?: string } = {}
): Promise<void> {
  const pk = periodKey();
  const where = {
    scope,
    serviceType,
    ...(scope === "OFFICE" ? { officeId: opts.officeId } : {}),
  };
  const lockKey = `leaderboard:${scope}:${serviceType}:${opts.officeId ?? "all"}`;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const previous = await tx.leaderboardEntry.findMany({ where, select: { subjectId: true, rank: true } });
    const prevRank = new Map(previous.map((p) => [p.subjectId, p.rank]));
    await tx.leaderboardEntry.deleteMany({ where });
    await tx.leaderboardEntry.createMany({
      data: ranked.map((r, i) => {
        const rank = i + 1;
        const old = prevRank.get(r.subjectId);
        return {
          scope,
          subjectType,
          subjectId: r.subjectId,
          serviceType,
          metric: "AVG_SCORE" as const,
          value: Number(Number(r.value).toFixed(2)),
          rank,
          movement: old ? old - rank : 0,
          periodKey: pk,
          ...(scope === "OFFICE" ? { officeId: opts.officeId } : {}),
        };
      }),
    });
  });
}
