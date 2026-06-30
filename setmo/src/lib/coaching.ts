import { prisma } from "@/lib/db";
import { skillName } from "@/lib/skills";

// Recommendation engine (rules-based, Phase-2 foundation):
// any skill averaging < THRESHOLD over the last N scored sessions maps to a
// published training tagged to that skill, with a stored human-readable reason.
const WEAK_THRESHOLD = 4.0;
const LOOKBACK_SESSIONS = 3;

/** Average score for one skill across a setter's scored calls, optionally only
 *  those started after `since`. Returns null when there's nothing to average. */
export async function skillAverage(setterId: string, skillKey: string, opts: { since?: Date; limit?: number } = {}): Promise<number | null> {
  const sessions = await prisma.session.findMany({
    where: { setterId, status: "SCORED", ...(opts.since ? { startedAt: { gt: opts.since } } : {}) },
    orderBy: { startedAt: "desc" },
    ...(opts.limit ? { take: opts.limit } : {}),
    include: { evaluation: { include: { skills: { where: { skillKey } } } } },
  });
  let sum = 0, n = 0;
  for (const s of sessions) for (const sk of s.evaluation?.skills ?? []) { sum += Number(sk.score); n++; }
  return n ? sum / n : null;
}

/** Create a recommendation, capturing the setter's current score on the target
 *  skill as the baseline (so we can measure movement after the training). */
export async function createRecommendation(data: { setterId: string; trainingId: string; skillKey: string; reason: string; sessionId?: string | null }) {
  const baseline = await skillAverage(data.setterId, data.skillKey, { limit: LOOKBACK_SESSIONS });
  return prisma.recommendation.create({
    data: {
      setterId: data.setterId,
      trainingId: data.trainingId,
      skillKey: data.skillKey,
      reason: data.reason,
      sessionId: data.sessionId ?? null,
      baselineScore: baseline,
      baselineAt: new Date(),
      status: "ACTIVE",
    },
  });
}

export type TrainingImpactRow = { setterName: string; skillKey: string; skillName: string; trainingTitle: string; baseline: number; after: number; delta: number; completedAt: Date };

/** Closed-loop training outcomes for an office: for each COMPLETED recommendation
 *  with a baseline and at least one scored call after completion, the skill's
 *  movement (after − baseline). Plus the average delta across all measured ones. */
export async function getTrainingImpact(officeId: string): Promise<{ rows: TrainingImpactRow[]; avgDelta: number | null; measured: number }> {
  const recs = await prisma.recommendation.findMany({
    where: { status: "COMPLETED", completedAt: { not: null }, baselineScore: { not: null }, setter: { officeId, status: "ACTIVE" } },
    orderBy: { completedAt: "desc" },
    include: { setter: { select: { firstName: true, lastName: true } }, training: { select: { title: true } } },
  });
  const rows: TrainingImpactRow[] = [];
  for (const r of recs) {
    const after = await skillAverage(r.setterId, r.skillKey, { since: r.completedAt! });
    if (after == null) continue; // no post-training calls yet → not measurable
    const baseline = Number(r.baselineScore);
    rows.push({
      setterName: [r.setter.firstName, r.setter.lastName].filter(Boolean).join(" ") || "Setter",
      skillKey: r.skillKey,
      skillName: skillName(r.skillKey),
      trainingTitle: r.training.title,
      baseline: Number(baseline.toFixed(1)),
      after: Number(after.toFixed(1)),
      delta: Number((after - baseline).toFixed(1)),
      completedAt: r.completedAt!,
    });
  }
  const avgDelta = rows.length ? Number((rows.reduce((a, r) => a + r.delta, 0) / rows.length).toFixed(1)) : null;
  return { rows, avgDelta, measured: rows.length };
}

export async function recomputeRecommendations(setterId: string): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { setterId, status: "SCORED" },
    orderBy: { startedAt: "desc" },
    take: LOOKBACK_SESSIONS,
    include: { evaluation: { include: { skills: true } } },
  });
  if (!sessions.length) return;

  // average per skill over the lookback window
  const totals = new Map<string, { sum: number; n: number }>();
  for (const s of sessions) {
    for (const sk of s.evaluation?.skills ?? []) {
      const t = totals.get(sk.skillKey) ?? { sum: 0, n: 0 };
      t.sum += Number(sk.score);
      t.n += 1;
      totals.set(sk.skillKey, t);
    }
  }

  const weak = [...totals.entries()]
    .map(([key, t]) => ({ key, avg: t.sum / t.n, n: t.n }))
    .filter((x) => x.avg < WEAK_THRESHOLD)
    .sort((a, b) => a.avg - b.avg);

  for (const w of weak) {
    const training = await prisma.training.findFirst({
      where: { targetSkillKey: w.key, status: "PUBLISHED" },
    });
    if (!training) continue;

    // Skip if an active recommendation for this skill already exists.
    const existing = await prisma.recommendation.findFirst({
      where: { setterId, skillKey: w.key, status: "ACTIVE" },
    });
    if (existing) continue;

    const reason = `your ${skillName(w.key).toLowerCase()} score has averaged ${w.avg.toFixed(
      1
    )} over your last ${w.n} session${w.n === 1 ? "" : "s"}`;

    await createRecommendation({ setterId, trainingId: training.id, skillKey: w.key, reason, sessionId: sessions[0].id });
  }
}
