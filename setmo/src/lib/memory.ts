import { prisma } from "@/lib/db";
import { skillName } from "@/lib/skills";
import type { Difficulty, ServiceKey } from "@/generated/prisma/client";

// SetMo-owned per-setter memory: a rolling summary injected into each new
// session for continuity, plus an escalating difficulty floor as the setter
// improves. Recomputed after each scored session.
//
// Memory is kept PER SERVICE. Being strong on implant calls says nothing about
// how someone handles an emergency toothache, so each kind of call carries its
// own difficulty floor and its own summary. The legacy top-level columns mirror
// implant, which keeps every existing reader working unchanged.
const LEGACY_SERVICE: ServiceKey = "IMPLANT";

export async function updateSetterMemory(setterId: string, serviceType: ServiceKey = LEGACY_SERVICE): Promise<void> {
  const sessions = await prisma.session.findMany({
    // practice only: the difficulty floor + role-play memory come from training
    // reps, never from ingested real (LIVE) calls
    where: { setterId, serviceType, kind: "PRACTICE", status: "SCORED" },
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

  // The ladder escalates as the setter improves: WARM (easiest) → ADAPTIVE
  // (balanced) → TOUGH. It was inverted — 3.8–4.5 setters were being sent to
  // WARM, an EASIER lead than the ADAPTIVE beginners got.
  const difficultyFloor: Difficulty = overall >= 4.5 ? "TOUGH" : overall >= 3.8 ? "ADAPTIVE" : "WARM";

  const summary = [
    `Recent average ${overall.toFixed(1)} across ${sessions.length} sessions (${trend >= 0 ? "up" : "down"} ${Math.abs(trend).toFixed(1)}).`,
    `Strongest: ${skillName(strongest.key).toLowerCase()} (${strongest.avg.toFixed(1)}).`,
    `Weakest: ${skillName(weakest.key).toLowerCase()} (${weakest.avg.toFixed(1)}) — keep pressure here.`,
    personas.size ? `Personas faced: ${[...personas].slice(0, 4).join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const existing = await prisma.setterMemory.findUnique({ where: { setterId } });
  const summaries = { ...((existing?.summaries as Record<string, string> | null) ?? {}), [serviceType]: summary };
  const floors = { ...((existing?.floors as Record<string, string> | null) ?? {}), [serviceType]: difficultyFloor };
  // The legacy columns stay the implant view, so nothing that reads them changes.
  const legacy = serviceType === LEGACY_SERVICE ? { summary, difficultyFloor } : {};

  await prisma.setterMemory.upsert({
    where: { setterId },
    update: { ...legacy, summaries, floors },
    create: { setterId, summary, difficultyFloor, summaries, floors },
  });
}

export type SetterMemoryView = { summary: string | null; difficultyFloor: Difficulty };

/** The memory that applies to ONE kind of call. Falls back to the legacy
 *  columns for implant, and to a fresh start for a service they've never run. */
export function memoryForService(
  memory: { summary: string | null; difficultyFloor: Difficulty; summaries: unknown; floors: unknown } | null,
  serviceType: ServiceKey
): SetterMemoryView {
  if (!memory) return { summary: null, difficultyFloor: "ADAPTIVE" };
  const summaries = (memory.summaries as Record<string, string> | null) ?? {};
  const floors = (memory.floors as Record<string, Difficulty> | null) ?? {};
  if (serviceType === LEGACY_SERVICE) {
    return {
      summary: summaries[serviceType] ?? memory.summary,
      difficultyFloor: floors[serviceType] ?? memory.difficultyFloor,
    };
  }
  return { summary: summaries[serviceType] ?? null, difficultyFloor: floors[serviceType] ?? "ADAPTIVE" };
}
