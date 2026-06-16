import { prisma } from "@/lib/db";
import { getAllowance, getSetterAnalytics, type AnalyticsRange } from "@/lib/queries";
import { skillName, skillTier, rubricFor } from "@/lib/skills";
import { fullName, initialsOf } from "@/lib/format";

export type SetterStatus = "top" | "rising" | "steady" | "watch" | "new";

function computeStatus(avg: number, delta: number, count: number): SetterStatus {
  if (count < 3) return "new";
  if (avg < 3.8) return "watch";
  if (avg >= 4.6) return "top";
  if (delta >= 0.2) return "rising";
  return "steady";
}

export type TeamRow = {
  id: string;
  name: string;
  initials: string;
  avg: number;
  delta: number;
  usageHours: number;
  sessions: number;
  lastActive: Date | null;
  trend: number[];
  recSkill: string | null;
  rec: string | null;
  status: SetterStatus;
};

// Per-setter aggregates for the whole office, computed in one pass.
export async function getOfficeTeam(officeId: string): Promise<TeamRow[]> {
  const [setters, sessions, recs] = await Promise.all([
    prisma.user.findMany({
      where: { officeId, role: "SETTER" },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.session.findMany({
      // exclude sub-minute hang-ups/interruptions from team aggregates
      where: { officeId, status: "SCORED", durationSeconds: { gte: 60 } },
      orderBy: { startedAt: "asc" },
      include: { evaluation: { select: { overallScore: true } } },
    }),
    prisma.recommendation.findMany({
      where: { status: "ACTIVE", setter: { officeId } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const byUser = new Map<string, { overalls: number[]; durations: number[]; last: Date | null }>();
  for (const s of sessions) {
    const u = byUser.get(s.setterId) ?? { overalls: [], durations: [], last: null };
    if (s.evaluation?.overallScore != null) u.overalls.push(Number(s.evaluation.overallScore));
    u.durations.push(s.durationSeconds ?? 0);
    if (!u.last || s.startedAt > u.last) u.last = s.startedAt;
    byUser.set(s.setterId, u);
  }
  const recByUser = new Map<string, { skillKey: string; reason: string }>();
  for (const r of recs) {
    if (!recByUser.has(r.setterId)) recByUser.set(r.setterId, { skillKey: r.skillKey, reason: r.reason });
  }

  const rows = setters.map((u) => {
    const agg = byUser.get(u.id) ?? { overalls: [], durations: [], last: null };
    const count = agg.overalls.length;
    const avg = count ? agg.overalls.reduce((a, b) => a + b, 0) / count : 0;
    const delta = count > 1 ? agg.overalls[count - 1] - agg.overalls[count - 2] : 0;
    const rec = recByUser.get(u.id);
    return {
      id: u.id,
      name: fullName(u.firstName, u.lastName),
      initials: initialsOf(u.firstName, u.lastName),
      avg,
      delta: Number(delta.toFixed(1)),
      usageHours: agg.durations.reduce((a, b) => a + b, 0) / 3600,
      sessions: count,
      lastActive: agg.last,
      trend: agg.overalls.slice(-7),
      recSkill: rec ? skillName(rec.skillKey) : null,
      rec: rec?.reason ?? null,
      status: computeStatus(avg, delta, count),
    };
  });

  return rows.sort((a, b) => b.avg - a.avg);
}

export async function getOfficeOverview(officeId: string) {
  const [team, allowance, office, subscription] = await Promise.all([
    getOfficeTeam(officeId),
    getAllowance(officeId),
    prisma.office.findUnique({ where: { id: officeId } }),
    prisma.subscription.findUnique({ where: { officeId } }),
  ]);

  const withSessions = team.filter((t) => t.sessions > 0);
  const teamAvg = withSessions.length
    ? withSessions.reduce((a, t) => a + t.avg, 0) / withSessions.length
    : 0;

  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const sessionsThisWeek = await prisma.session.count({
    where: { officeId, status: "SCORED", durationSeconds: { gte: 60 }, startedAt: { gte: weekAgo } },
  });

  return {
    practiceName: office?.name ?? "Your practice",
    city: office?.city ?? "",
    seats: subscription?.seats ?? office?.seatCount ?? team.length,
    teamAvg,
    activeSetters: withSessions.length,
    sessionsThisWeek,
    allowance,
    team,
    attention: team.filter((t) => t.status === "watch" || t.status === "new"),
  };
}

// Team-wide skill averages from each setter's most recent scored call — shows
// the office's systemic strengths/gaps (vs. one person's gap).
export async function getOfficeSkillHeatmap(officeId: string) {
  const sessions = await prisma.session.findMany({
    where: { officeId, status: "SCORED", durationSeconds: { gte: 60 }, evaluation: { isNot: null } },
    orderBy: { startedAt: "desc" },
    include: { evaluation: { include: { skills: true } } },
  });

  const seen = new Set<string>();
  const sums = new Map<string, { total: number; n: number }>();
  for (const s of sessions) {
    if (seen.has(s.setterId)) continue; // latest only, per setter
    seen.add(s.setterId);
    for (const sk of s.evaluation!.skills) {
      const cur = sums.get(sk.skillKey) ?? { total: 0, n: 0 };
      cur.total += Number(sk.score);
      cur.n += 1;
      sums.set(sk.skillKey, cur);
    }
  }

  const order = rubricFor("IMPLANT").map((s) => s.key);
  return [...sums.entries()]
    .map(([key, v]) => ({ key, name: skillName(key), tier: skillTier(key), avg: v.total / v.n }))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

// Everything the Office Admin coach needs to be grounded + to take actions.
export async function getOfficeCoachContext(officeId: string) {
  const [overview, heatmap, outcomes, trainings] = await Promise.all([
    getOfficeOverview(officeId),
    getOfficeSkillHeatmap(officeId),
    prisma.officeOutcome.findMany({ where: { officeId }, orderBy: { periodLabel: "desc" }, take: 3 }),
    prisma.training.findMany({ where: { status: "PUBLISHED" }, select: { id: true, title: true, targetSkillKey: true } }),
  ]);

  return {
    overview,
    heatmap,
    outcomes,
    trainings: trainings.map((t) => ({ id: t.id, title: t.title, skillKey: t.targetSkillKey })),
    setters: overview.team.map((t) => ({ id: t.id, name: t.name })),
  };
}

export function currentPeriod() {
  const d = new Date();
  return {
    label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    name: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
  };
}

export async function getOutcome(officeId: string, periodLabel: string) {
  return prisma.officeOutcome.findUnique({ where: { officeId_periodLabel: { officeId, periodLabel } } });
}

export async function getOfficeSetterDetail(officeId: string, setterId: string, range?: AnalyticsRange) {
  const setter = await prisma.user.findFirst({
    where: { id: setterId, officeId, role: "SETTER" },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!setter) return null;

  // Same period analytics the setter sees — windowed, vs the previous period,
  // <1-min calls excluded, and the chart carries all 8 skills + overall.
  const now = new Date();
  const current: AnalyticsRange = range ?? { from: new Date(now.getTime() - 30 * 86400_000), to: now };
  const len = current.to.getTime() - current.from.getTime();
  const prior: AnalyticsRange = { from: new Date(current.from.getTime() - len), to: current.from };

  const [a, rec] = await Promise.all([
    getSetterAnalytics(setterId, current, prior, { allSkills: true }),
    prisma.recommendation.findFirst({
      where: { setterId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: { training: true },
    }),
  ]);

  return {
    id: setter.id,
    name: fullName(setter.firstName, setter.lastName),
    avg: a.overallAvg,
    delta: a.overallDelta,
    hasPrior: a.hasPrior,
    usageHours: a.hours,
    sessions: a.reps,
    focus: a.focus,
    mostImproved: a.mostImproved,
    points: a.points,
    series: a.series,
    snapshot: a.perSkill,
    recommendation: rec ? { skill: skillName(rec.skillKey), reason: rec.reason, training: rec.training.title } : null,
  };
}
