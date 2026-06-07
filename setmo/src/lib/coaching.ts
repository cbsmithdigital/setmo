import { prisma } from "@/lib/db";
import { skillName } from "@/lib/skills";

// Recommendation engine (rules-based, Phase-2 foundation):
// any skill averaging < THRESHOLD over the last N scored sessions maps to a
// published training tagged to that skill, with a stored human-readable reason.
const WEAK_THRESHOLD = 4.0;
const LOOKBACK_SESSIONS = 3;

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

    await prisma.recommendation.create({
      data: {
        setterId,
        trainingId: training.id,
        skillKey: w.key,
        reason,
        status: "ACTIVE",
        sessionId: sessions[0].id,
      },
    });
  }
}
