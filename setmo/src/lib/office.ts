import { prisma } from "@/lib/db";
import { getAllowance, getSetterAnalytics, type AnalyticsRange } from "@/lib/queries";
import { skillName, skillTier, skillShort, rubricFor } from "@/lib/skills";
import { fullName, initialsOf } from "@/lib/format";

// The default analytics window for office views — this calendar month, matching
// the setter dashboard + the team-member detail page so numbers agree.
function thisMonthRange(): AnalyticsRange {
  const n = new Date();
  return { from: new Date(n.getFullYear(), n.getMonth(), 1), to: n };
}

// Average each skill across ALL real (≥1 min) sessions in the window for the
// given offices — "good overall data," not just the last call.
export async function skillAveragesOverSessions(officeIds: string[], range: AnalyticsRange) {
  const sessions = await prisma.session.findMany({
    where: {
      officeId: { in: officeIds },
      status: "SCORED",
      durationSeconds: { gte: 60 },
      startedAt: { gte: range.from, lte: range.to },
      evaluation: { isNot: null },
    },
    include: { evaluation: { include: { skills: true } } },
  });
  const sums = new Map<string, { t: number; n: number }>();
  for (const s of sessions)
    for (const sk of s.evaluation!.skills) {
      const c = sums.get(sk.skillKey) ?? { t: 0, n: 0 };
      c.t += Number(sk.score);
      c.n++;
      sums.set(sk.skillKey, c);
    }
  const order = rubricFor("IMPLANT").map((s) => s.key);
  return order
    .filter((k) => sums.has(k))
    .map((k) => ({ key: k, name: skillName(k), tier: skillTier(k), avg: Number((sums.get(k)!.t / sums.get(k)!.n).toFixed(1)) }));
}

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

// Per-setter aggregates for the whole office over a window (default: this month),
// computed in one pass.
export async function getOfficeTeam(officeId: string, range: AnalyticsRange = thisMonthRange()): Promise<TeamRow[]> {
  const [setters, sessions, recs] = await Promise.all([
    prisma.user.findMany({
      where: { officeId, role: "SETTER" },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.session.findMany({
      // windowed, excluding sub-minute hang-ups/interruptions
      where: { officeId, status: "SCORED", durationSeconds: { gte: 60 }, startedAt: { gte: range.from, lte: range.to } },
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

export async function getOfficeOverview(officeId: string, range: AnalyticsRange = thisMonthRange()) {
  const [team, allowance, office, subscription, skills] = await Promise.all([
    getOfficeTeam(officeId, range),
    getAllowance(officeId),
    prisma.office.findUnique({ where: { id: officeId } }),
    prisma.subscription.findUnique({ where: { officeId } }),
    getOfficeSkillHeatmap(officeId, range),
  ]);

  const withSessions = team.filter((t) => t.sessions > 0);
  const teamAvg = withSessions.length
    ? withSessions.reduce((a, t) => a + t.avg, 0) / withSessions.length
    : 0;

  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const sessionsThisWeek = await prisma.session.count({
    where: { officeId, status: "SCORED", durationSeconds: { gte: 60 }, startedAt: { gte: weekAgo } },
  });

  // Office strengths + gaps (this month) for the overview card.
  const ranked = [...skills].sort((a, b) => b.avg - a.avg);
  const topSkills = ranked.slice(0, 2);
  const gapSkills = ranked.slice(-2).reverse();

  return {
    practiceName: office?.name ?? "Your practice",
    city: office?.city ?? "",
    seats: subscription?.seats ?? office?.seatCount ?? team.length,
    teamAvg,
    activeSetters: withSessions.length,
    sessionsThisWeek,
    allowance,
    team,
    skills,
    topSkills,
    gapSkills,
    attention: team.filter((t) => t.status === "watch" || t.status === "new"),
  };
}

// Team-wide skill averages over this month (every real call, not just the last
// one) — the office's systemic strengths/gaps.
export async function getOfficeSkillHeatmap(officeId: string, range: AnalyticsRange = thisMonthRange()) {
  return skillAveragesOverSessions([officeId], range);
}

// Setter × skill heatmap matrix for the office over a window — same shape the
// SkillMatrix component renders for the group (one level down).
export async function getOfficeSkillMatrix(officeId: string, range: AnalyticsRange = thisMonthRange()) {
  const [setters, sessions] = await Promise.all([
    prisma.user.findMany({ where: { officeId, role: "SETTER" }, select: { id: true, firstName: true, lastName: true } }),
    prisma.session.findMany({
      where: { officeId, status: "SCORED", durationSeconds: { gte: 60 }, startedAt: { gte: range.from, lte: range.to }, evaluation: { isNot: null } },
      include: { evaluation: { include: { skills: true } } },
    }),
  ]);
  const order = rubricFor("IMPLANT").map((s) => s.key);
  const r1 = (n: number) => Number(n.toFixed(1));

  // per-setter accumulators
  const acc = new Map<string, { overalls: number[]; sums: Map<string, { t: number; n: number }> }>();
  for (const s of sessions) {
    if (s.evaluation!.skills.length === 0 || s.evaluation!.overallScore == null) continue;
    const a = acc.get(s.setterId) ?? { overalls: [] as number[], sums: new Map<string, { t: number; n: number }>() };
    a.overalls.push(Number(s.evaluation!.overallScore));
    for (const k of s.evaluation!.skills) {
      const c = a.sums.get(k.skillKey) ?? { t: 0, n: 0 };
      c.t += Number(k.score);
      c.n++;
      a.sums.set(k.skillKey, c);
    }
    acc.set(s.setterId, a);
  }

  const nameById = new Map(setters.map((u) => [u.id, fullName(u.firstName, u.lastName)]));
  const rows = [...acc.entries()]
    .map(([id, a]) => ({
      id,
      name: nameById.get(id) ?? "Setter",
      avg: r1(a.overalls.reduce((x, y) => x + y, 0) / a.overalls.length),
      cells: order.map((k) => {
        const c = a.sums.get(k);
        return { key: k, score: c ? r1(c.t / c.n) : null };
      }),
    }))
    .sort((a, b) => b.avg - a.avg);

  return { skills: order.map((k) => ({ key: k, short: skillShort(k) })), rows };
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

// First-run activation checklist for a new account. Each step auto-completes from
// real state; the card hides once everything's done.
export async function getOnboarding(officeId: string) {
  const [sub, allowance, setterCount, sessionCount] = await Promise.all([
    prisma.subscription.findUnique({ where: { officeId }, select: { status: true } }),
    getAllowance(officeId),
    prisma.user.count({ where: { officeId, role: "SETTER" } }),
    prisma.session.count({ where: { officeId } }),
  ]);
  const steps = [
    { key: "access", label: "Activate Practice Access", desc: "$44.95/mo — month-to-month, cancel anytime", href: "/office/billing", cta: "Activate", done: sub?.status === "ACTIVE" },
    { key: "minutes", label: "Add practice minutes", desc: "Buy a balance — every call draws from it", href: "/office/billing", cta: "Buy minutes", done: allowance.purchasedMin > 0 },
    { key: "team", label: "Invite your team", desc: "Add setters & managers — free and unlimited", href: "/office/team", cta: "Invite", done: setterCount >= 1 },
    { key: "call", label: "Run your first practice call", desc: "See a call scored on the 8-skill rubric", href: "/practice", cta: "Start", done: sessionCount >= 1 },
  ];
  return { steps, doneCount: steps.filter((s) => s.done).length, allDone: steps.every((s) => s.done) };
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
