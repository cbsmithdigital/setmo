import { prisma } from "@/lib/db";
import { skillName } from "@/lib/skills";

// SetMo-owned per-setter memory: a rolling summary injected into each new
// session for continuity, plus an escalating difficulty floor as the setter
// improves. Recomputed after each scored session.
export async function updateSetterMemory(setterId: string): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { setterId, status: "SCORED" },
    orderBy: { startedAt: "desc" },
    take: 5,
    include: { evaluation: { include: { skills: true } } },
  });
  if (!sessions.length) return;

  // Average each skill across the recent window.
  const totals = new Map<string, { sum: number; n: number }>();
  const personas = new Set<string>();
  for (const s of sessions) {
    const p = (s.personaSeed as { persona?: string } | null)?.persona;
    if (p) personas.add(p);
    for (const sk of s.evaluation?.skills ?? []) {
      const t = totals.get(sk.skillKey) ?? { sum: 0, n: 0 };
      t.sum += Number(sk.score);
      t.n += 1;
      totals.set(sk.skillKey, t);
    }
  }
  const averaged = [...totals.entries()].map(([key, t]) => ({ key, avg: t.sum / t.n }));
  if (!averaged.length) return;

  const strongest = averaged.reduce((a, b) => (b.avg > a.avg ? b : a));
  const weakest = averaged.reduce((a, b) => (b.avg < a.avg ? b : a));
  const overall = averaged.reduce((a, b) => a + b.avg, 0) / averaged.length;

  // Trend: oldest vs newest overall in the window.
  const overallOf = (s: (typeof sessions)[number]) =>
    s.evaluation?.overallScore != null ? Number(s.evaluation.overallScore) : overall;
  const newest = overallOf(sessions[0]);
  const oldest = overallOf(sessions[sessions.length - 1]);
  const trend = newest - oldest;

  const difficultyFloor = overall >= 4.5 ? "TOUGH" : overall >= 3.8 ? "WARM" : "ADAPTIVE";

  const summary = [
    `Recent average ${overall.toFixed(1)} across ${sessions.length} sessions (${trend >= 0 ? "up" : "down"} ${Math.abs(trend).toFixed(1)}).`,
    `Strongest: ${skillName(strongest.key).toLowerCase()} (${strongest.avg.toFixed(1)}).`,
    `Weakest: ${skillName(weakest.key).toLowerCase()} (${weakest.avg.toFixed(1)}) — keep pressure here.`,
    personas.size ? `Personas faced: ${[...personas].slice(0, 4).join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  await prisma.setterMemory.upsert({
    where: { setterId },
    update: { summary, difficultyFloor },
    create: { setterId, summary, difficultyFloor },
  });
}
