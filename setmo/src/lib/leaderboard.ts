import { prisma } from "@/lib/db";
import type { ServiceKey } from "@/generated/prisma/client";

// Fairness-weighted leaderboards: ranked on AVERAGE score, never raw session
// volume, so high-volume practices don't auto-win. Materialized into
// leaderboard_entry and recomputed after each scored session.

function periodKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DEFAULT_SERVICE: ServiceKey = "IMPLANT";

/** Office scope: rank the office's own setters by average score. */
export async function recomputeOfficeLeaderboard(
  officeId: string,
  serviceType: ServiceKey = DEFAULT_SERVICE
): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { officeId, serviceType, kind: "PRACTICE", status: "SCORED", evaluation: { isNot: null } },
    include: { evaluation: { select: { overallScore: true } } },
  });

  const byUser = new Map<string, number[]>();
  for (const s of sessions) {
    if (s.evaluation?.overallScore == null) continue;
    const arr = byUser.get(s.setterId) ?? [];
    arr.push(Number(s.evaluation.overallScore));
    byUser.set(s.setterId, arr);
  }

  const ranked = [...byUser.entries()]
    .map(([subjectId, scores]) => ({ subjectId, value: scores.reduce((a, b) => a + b, 0) / scores.length }))
    .sort((a, b) => b.value - a.value);

  await materialize("OFFICE", "SETTER", serviceType, ranked, { officeId });
}

/** Global scope: rank offices by their average score (privacy-respecting). */
export async function recomputeGlobalLeaderboard(
  serviceType: ServiceKey = DEFAULT_SERVICE
): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { serviceType, kind: "PRACTICE", status: "SCORED", evaluation: { isNot: null } },
    include: { evaluation: { select: { overallScore: true } } },
  });

  const byOffice = new Map<string, number[]>();
  for (const s of sessions) {
    if (s.evaluation?.overallScore == null) continue;
    const arr = byOffice.get(s.officeId) ?? [];
    arr.push(Number(s.evaluation.overallScore));
    byOffice.set(s.officeId, arr);
  }

  const ranked = [...byOffice.entries()]
    .map(([subjectId, scores]) => ({ subjectId, value: scores.reduce((a, b) => a + b, 0) / scores.length }))
    .sort((a, b) => b.value - a.value);

  await materialize("GLOBAL", "OFFICE", serviceType, ranked);
}

export async function recomputeLeaderboards(officeId: string): Promise<void> {
  await Promise.all([recomputeOfficeLeaderboard(officeId), recomputeGlobalLeaderboard()]);
}

// Replace the materialized rows for a scope, carrying rank movement forward.
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

  const previous = await prisma.leaderboardEntry.findMany({ where });
  const prevRank = new Map(previous.map((p) => [p.subjectId, p.rank]));

  await prisma.$transaction([
    prisma.leaderboardEntry.deleteMany({ where }),
    prisma.leaderboardEntry.createMany({
      data: ranked.map((r, i) => {
        const rank = i + 1;
        const old = prevRank.get(r.subjectId);
        return {
          scope,
          subjectType,
          subjectId: r.subjectId,
          serviceType,
          metric: "AVG_SCORE" as const,
          value: Number(r.value.toFixed(2)),
          rank,
          movement: old ? old - rank : 0,
          periodKey: pk,
          ...(scope === "OFFICE" ? { officeId: opts.officeId } : {}),
        };
      }),
    }),
  ]);
}
