import { prisma } from "@/lib/db";
import type { AnalyticsRange } from "@/lib/queries";
import { callShowRate } from "@/lib/audit";
import { getIncentiveProvider } from "@/lib/incentives";
import { fullName } from "@/lib/format";
import { skillName } from "@/lib/skills";

// Goal evaluation engine. Reads the same analytics the dashboards use, applies the
// goal's comparator, and updates per-person progress + reward status. Achievement
// is frozen by achievedAt; reward sends are idempotent on the participant id.

type GoalRow = Awaited<ReturnType<typeof loadGoal>>;

function loadGoal(goalId: string) {
  return prisma.goal.findUnique({ where: { id: goalId }, include: { participants: { include: { setter: true } } } });
}

const monthRange = (y: number, m: number, now: Date): AnalyticsRange => ({ from: new Date(y, m, 1), to: new Date(Math.min(now.getTime(), new Date(y, m + 1, 1, 0, 0, 0, -1).getTime())) });

export function goalRange(goal: { window: string; startDate: Date | null; endDate: Date | null; periodKey: string | null }): AnalyticsRange {
  const now = new Date();
  if (goal.window === "CUSTOM" && goal.startDate) return { from: goal.startDate, to: goal.endDate ?? now };
  if (goal.window === "LAST_30D") return { from: new Date(now.getTime() - 30 * 86400_000), to: now };
  if (goal.window === "ONGOING") return { from: new Date(2000, 0, 1), to: now };
  if (goal.periodKey) {
    const [y, m] = goal.periodKey.split("-").map(Number);
    return monthRange(y, m - 1, now);
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

type Scored = { startedAt: Date; durationSeconds: number | null; evaluation: { overallScore: unknown; booked: boolean | null; skills: { skillKey: string; score: unknown }[] } | null };
function reduce(sessions: Scored[], skillKey?: string | null) {
  const real = sessions.filter((s) => s.evaluation && s.evaluation.skills.length > 0 && s.evaluation.overallScore != null);
  const overalls = real.map((s) => Number(s.evaluation!.overallScore));
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const skillVals = skillKey ? real.flatMap((s) => s.evaluation!.skills.filter((k) => k.skillKey === skillKey).map((k) => Number(k.score))) : [];
  const showRates = real.map((s) => callShowRate(s.evaluation!.skills.map((k) => ({ skillKey: k.skillKey, score: Number(k.score) }))));
  return {
    reps: real.length,
    overall: mean(overalls),
    bestOverall: overalls.length ? Math.max(...overalls) : 0,
    skill: mean(skillVals),
    hours: real.reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 3600,
    setRate: real.length ? real.filter((s) => s.evaluation!.booked === true).length / real.length : 0,
    showRate: showRates.length ? mean(showRates) / 100 : 0,
  };
}

// consecutive weeks (ending this week) with ≥1 real rep
function streakWeeks(dates: Date[]): number {
  const wk = (d: Date) => Math.floor((d.getTime() - Date.UTC(2020, 0, 6)) / (7 * 86400_000)); // Mon-anchored
  const weeks = new Set(dates.map(wk));
  let n = 0;
  for (let w = wk(new Date()); weeks.has(w); w--) n++;
  return n;
}

async function setterScored(setterId: string, range: AnalyticsRange) {
  return prisma.session.findMany({
    where: { setterId, status: "SCORED", durationSeconds: { gte: 60 }, startedAt: { gte: range.from, lte: range.to }, evaluation: { isNot: null } },
    include: { evaluation: { include: { skills: true } } },
  });
}

async function officeScored(officeId: string, range: AnalyticsRange) {
  return prisma.session.findMany({
    where: { officeId, status: "SCORED", durationSeconds: { gte: 60 }, startedAt: { gte: range.from, lte: range.to }, evaluation: { isNot: null } },
    include: { evaluation: { include: { skills: true } } },
  });
}

const pct = (v: number) => Math.round(v * 100);

// value + reps for ONE setter participant
async function measureSetter(goal: NonNullable<GoalRow>, setterId: string, range: AnalyticsRange): Promise<{ value: number; reps: number }> {
  if (goal.metric === "LEADERBOARD_RANK") {
    const setter = await prisma.user.findUnique({ where: { id: setterId }, select: { officeId: true } });
    const latest = await prisma.leaderboardEntry.findFirst({ where: { scope: "OFFICE", officeId: setter?.officeId ?? "", subjectType: "SETTER", subjectId: setterId }, orderBy: { periodKey: "desc" } });
    return { value: latest?.rank ?? 0, reps: latest ? 1 : 0 };
  }
  if (goal.metric === "PERSONAL_BEST") {
    const m = reduce(await setterScored(setterId, range));
    return { value: m.bestOverall, reps: m.reps };
  }
  const m = reduce(await setterScored(setterId, range), goal.skillKey);
  switch (goal.metric) {
    case "OVERALL_SCORE": return { value: m.overall, reps: m.reps };
    case "SKILL_SCORE": return { value: m.skill, reps: m.reps };
    case "SET_RATE": return { value: pct(m.setRate), reps: m.reps };
    case "SHOW_RATE": return { value: pct(m.showRate), reps: m.reps };
    case "REPS": return { value: m.reps, reps: m.reps };
    case "PRACTICE_HOURS": return { value: Number(m.hours.toFixed(1)), reps: m.reps };
    case "STREAK_WEEKS": {
      const all = await setterScored(setterId, { from: new Date(Date.now() - 120 * 86400_000), to: new Date() });
      return { value: streakWeeks(all.filter((s) => s.evaluation && s.evaluation.skills.length > 0).map((s) => s.startedAt)), reps: m.reps };
    }
    default: return { value: 0, reps: m.reps };
  }
}

// team aggregate value + total reps (CONSULTS/CASES/PRODUCTION come from OfficeOutcome)
async function measureTeam(goal: NonNullable<GoalRow>, officeId: string, range: AnalyticsRange): Promise<{ value: number; reps: number }> {
  if (goal.metric === "CONSULTS" || goal.metric === "CASES" || goal.metric === "PRODUCTION") {
    const periodKey = goal.periodKey ?? `${range.to.getFullYear()}-${String(range.to.getMonth() + 1).padStart(2, "0")}`;
    const o = await prisma.officeOutcome.findUnique({ where: { officeId_periodLabel: { officeId, periodLabel: periodKey } } });
    const reps = (await officeScored(officeId, range)).length;
    const value = goal.metric === "CONSULTS" ? o?.consultsBooked ?? 0 : goal.metric === "CASES" ? o?.casesStarted ?? 0 : o?.production ?? 0;
    return { value, reps };
  }
  const m = reduce(await officeScored(officeId, range), goal.skillKey);
  switch (goal.metric) {
    case "OVERALL_SCORE": return { value: m.overall, reps: m.reps };
    case "SKILL_SCORE": return { value: m.skill, reps: m.reps };
    case "SET_RATE": return { value: pct(m.setRate), reps: m.reps };
    case "SHOW_RATE": return { value: pct(m.showRate), reps: m.reps };
    case "REPS": return { value: m.reps, reps: m.reps };
    case "PRACTICE_HOURS": return { value: Number(m.hours.toFixed(1)), reps: m.reps };
    default: return { value: m.overall, reps: m.reps };
  }
}

// achieved? + progress% for a measured value
function judge(goal: { comparator: string; targetValue: number }, value: number, baseline: number | null): { achieved: boolean; progressPct: number } {
  const t = goal.targetValue;
  if (goal.comparator === "RANK_TOP") {
    const achieved = value > 0 && value <= t;
    return { achieved, progressPct: value > 0 ? Math.min(100, Math.round((t / value) * 100)) : 0 };
  }
  if (goal.comparator === "IMPROVE_BY") {
    const delta = value - (baseline ?? value);
    return { achieved: delta >= t, progressPct: t > 0 ? Math.max(0, Math.min(100, Math.round((delta / t) * 100))) : 0 };
  }
  // REACH / MAINTAIN
  return { achieved: value >= t, progressPct: t > 0 ? Math.max(0, Math.min(100, Math.round((value / t) * 100))) : 0 };
}

const scoreMetric = (m: string) => ["OVERALL_SCORE", "SKILL_SCORE", "SET_RATE", "SHOW_RATE", "CONSULTS", "CASES", "PRODUCTION", "PERSONAL_BEST"].includes(m);

/** Evaluate one goal: refresh every participant's progress, flip achievements,
 *  and queue rewards (PENDING) for newly-achieved qualified participants. */
export async function evaluateGoal(goalId: string): Promise<void> {
  const goal = await loadGoal(goalId);
  if (!goal || goal.status !== "ACTIVE") return;
  const range = goalRange(goal);
  const needReps = scoreMetric(goal.metric) ? goal.minQualifyingReps : 1;

  if (goal.targetType === "TEAM") {
    if (!goal.officeId) return;
    const team = await measureTeam(goal, goal.officeId, range);
    const { achieved: teamAchieved, progressPct } = judge(goal, team.value, null);
    await prisma.goal.update({ where: { id: goal.id }, data: { teamValue: team.value, teamAchieved, achievedAt: teamAchieved && !goal.achievedAt ? new Date() : goal.achievedAt } });

    // reps per participant (for qualification) over the window
    for (const p of goal.participants) {
      const isManager = p.setter.role !== "SETTER";
      const reps = isManager ? 1 : (await setterScored(p.setterId, range)).length;
      const qualified = isManager ? goal.includeManager : reps >= 1;
      const justAchieved = teamAchieved && qualified && !p.achieved;
      await prisma.goalParticipant.update({
        where: { id: p.id },
        data: {
          currentValue: team.value,
          progressPct,
          qualified,
          achieved: teamAchieved && qualified ? true : p.achieved,
          achievedAt: justAchieved ? new Date() : p.achievedAt,
          rewardStatus: justAchieved && p.rewardStatus === "NONE" ? "PENDING" : p.rewardStatus,
          rewardAmountCents: justAchieved ? goal.rewardAmountCents : p.rewardAmountCents,
        },
      });
    }
    return;
  }

  // SETTER goal: each participant measured individually
  for (const p of goal.participants) {
    const { value, reps } = await measureSetter(goal, p.setterId, range);
    const qualified = reps >= needReps;
    const { achieved, progressPct } = judge(goal, value, p.baselineValue);
    const ok = achieved && qualified;
    const justAchieved = ok && !p.achieved;
    await prisma.goalParticipant.update({
      where: { id: p.id },
      data: {
        currentValue: value,
        progressPct,
        qualified,
        achieved: ok ? true : p.achieved,
        achievedAt: justAchieved ? new Date() : p.achievedAt,
        rewardStatus: justAchieved && p.rewardStatus === "NONE" ? "PENDING" : p.rewardStatus,
        rewardAmountCents: justAchieved ? goal.rewardAmountCents : p.rewardAmountCents,
      },
    });
  }
}

/** Activate a DRAFT goal: create participant rows, capture baselines, evaluate. */
export async function activateGoal(goalId: string, setterIds: string[]): Promise<void> {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) return;
  const now = new Date();
  const periodKey = goal.recurrence === "MONTHLY" ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` : goal.periodKey;
  const seriesId = goal.recurrence === "MONTHLY" ? goal.seriesId ?? goal.id : goal.seriesId;
  const range = goalRange({ ...goal, periodKey });

  // resolve participants
  let ids: string[] = [];
  if (goal.targetType === "TEAM" && goal.officeId) {
    const team = await prisma.user.findMany({ where: { officeId: goal.officeId, role: "SETTER", status: "ACTIVE" }, select: { id: true } });
    ids = team.map((u) => u.id);
    if (goal.includeManager) {
      const mgr = await prisma.user.findFirst({ where: { officeId: goal.officeId, role: "OFFICE_ADMIN", status: "ACTIVE" }, select: { id: true } });
      if (mgr) ids.push(mgr.id);
    }
  } else {
    ids = setterIds;
  }

  await prisma.goal.update({ where: { id: goalId }, data: { status: "ACTIVE", periodKey, seriesId } });

  for (const setterId of ids) {
    let baseline: number | null = null;
    if (goal.comparator === "IMPROVE_BY") {
      const m = await measureSetter({ ...goal, periodKey, participants: [] } as unknown as NonNullable<GoalRow>, setterId, range);
      baseline = m.value;
    }
    await prisma.goalParticipant.upsert({
      where: { goalId_setterId: { goalId, setterId } },
      create: { goalId, setterId, baselineValue: baseline },
      update: { baselineValue: baseline },
    });
  }
  await evaluateGoal(goalId);
}

/** Evaluate every active goal touching this setter (their own + their office's team goals). */
export async function evaluateGoalsForSetter(setterId: string): Promise<void> {
  const setter = await prisma.user.findUnique({ where: { id: setterId }, select: { officeId: true } });
  const goals = await prisma.goal.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ participants: { some: { setterId } } }, ...(setter?.officeId ? [{ targetType: "TEAM" as const, officeId: setter.officeId }] : [])],
    },
    select: { id: true },
  });
  for (const g of goals) await evaluateGoal(g.id);
}

/** Cron sweep: evaluate all active goals; expire past-window goals; roll monthly recurrences. */
export async function sweepGoals(): Promise<{ evaluated: number; expired: number; rolled: number }> {
  const active = await prisma.goal.findMany({ where: { status: "ACTIVE" } });
  let expired = 0;
  let rolled = 0;
  const now = new Date();
  for (const g of active) {
    await evaluateGoal(g.id);
    const range = goalRange(g);
    const ended = g.window === "CUSTOM" && g.endDate ? now > g.endDate : g.recurrence === "MONTHLY" && g.periodKey ? now >= new Date(range.to.getTime() + 1000) : false;
    if (ended) {
      await prisma.goal.update({ where: { id: g.id }, data: { status: "COMPLETED" } });
      expired++;
      if (g.recurrence === "MONTHLY") {
        // spawn next month's instance (same definition, fresh participants/baselines)
        const next = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
        const exists = await prisma.goal.findFirst({ where: { seriesId: g.seriesId ?? g.id, periodKey } });
        if (!exists) {
          const clone = await prisma.goal.create({
            data: {
              creatorScope: g.creatorScope, officeId: g.officeId, organizationId: g.organizationId, createdById: g.createdById,
              title: g.title, description: g.description, targetType: g.targetType, metric: g.metric, skillKey: g.skillKey,
              comparator: g.comparator, targetValue: g.targetValue, window: g.window, recurrence: g.recurrence,
              seriesId: g.seriesId ?? g.id, periodKey, minQualifyingReps: g.minQualifyingReps, rewardType: g.rewardType,
              rewardAmountCents: g.rewardAmountCents, rewardLabel: g.rewardLabel, funderScope: g.funderScope, includeManager: g.includeManager,
              status: "DRAFT",
            },
          });
          const priorSetters = await prisma.goalParticipant.findMany({ where: { goalId: g.id }, select: { setterId: true, setter: { select: { role: true } } } });
          await activateGoal(clone.id, priorSetters.filter((s) => s.setter.role === "SETTER").map((s) => s.setterId));
          rolled++;
        }
      }
    }
  }
  return { evaluated: active.length, expired, rolled };
}

/** Approve & send / mark sent / decline a participant's reward. */
export async function decideReward(participantId: string, action: "approve" | "marksent" | "decline", byUserId: string) {
  const p = await prisma.goalParticipant.findUnique({ where: { id: participantId }, include: { goal: true, setter: true } });
  if (!p || !p.achieved) return { ok: false, error: "not achieved" };

  if (action === "decline") {
    await prisma.goalParticipant.update({ where: { id: participantId }, data: { rewardStatus: "DECLINED", approvedById: byUserId } });
    return { ok: true, status: "DECLINED" };
  }
  if (p.rewardStatus === "SENT") return { ok: true, status: "SENT" };

  await prisma.goalParticipant.update({ where: { id: participantId }, data: { rewardStatus: "APPROVED", approvedById: byUserId } });

  // Custom (non-cash) incentives like PTO can't be transmitted by a vendor —
  // approving them just records manual fulfillment.
  if (action === "marksent" || p.goal.rewardType === "CUSTOM") {
    await prisma.goalParticipant.update({ where: { id: participantId }, data: { rewardStatus: "SENT", sentAt: new Date(), providerRef: "manual" } });
    return { ok: true, status: "SENT" };
  }

  // approve → provider send
  const provider = getIncentiveProvider();
  const res = await provider.send({
    toEmail: p.setter.email,
    toName: fullName(p.setter.firstName, p.setter.lastName),
    amountCents: p.rewardAmountCents ?? p.goal.rewardAmountCents,
    label: p.goal.rewardLabel,
    idempotencyKey: p.id,
  });
  await prisma.goalParticipant.update({
    where: { id: participantId },
    data: { rewardStatus: res.status, sentAt: res.status === "SENT" ? new Date() : null, providerRef: res.providerRef ?? null },
  });
  return { ok: res.status === "SENT", status: res.status, error: res.error };
}

// ---- human-readable goal summary (used by lists + previews) ----
const METRIC_LABEL: Record<string, string> = {
  OVERALL_SCORE: "overall score", SKILL_SCORE: "skill", SET_RATE: "set rate", SHOW_RATE: "show rate",
  CONSULTS: "consults booked", CASES: "cases started", PRODUCTION: "production", REPS: "reps",
  PRACTICE_HOURS: "practice hours", STREAK_WEEKS: "week streak", LEADERBOARD_RANK: "leaderboard rank",
  PERSONAL_BEST: "personal best", MANUAL: "milestone",
};
export function goalMetricLabel(metric: string, skillKey?: string | null): string {
  if (metric === "SKILL_SCORE" && skillKey) return skillName(skillKey);
  return METRIC_LABEL[metric] ?? metric;
}
export function goalTargetText(goal: { metric: string; comparator: string; targetValue: number; skillKey?: string | null }): string {
  const label = goalMetricLabel(goal.metric, goal.skillKey);
  const unit = goal.metric === "SET_RATE" || goal.metric === "SHOW_RATE" ? "%" : goal.metric === "PRODUCTION" ? " $" : "";
  if (goal.comparator === "RANK_TOP") return `Reach top ${goal.targetValue} on ${label}`;
  if (goal.comparator === "IMPROVE_BY") return `Improve ${label} by ${goal.targetValue}${unit}`;
  if (goal.comparator === "MAINTAIN") return `Maintain ${label} at ${goal.targetValue}${unit}`;
  return `Reach ${goal.targetValue}${unit} ${label}`;
}

// ---- reads for the dashboards ----
export const rewardText = (g: { rewardType: string; rewardAmountCents: number | null; rewardLabel: string | null }) =>
  g.rewardType === "GIFT_CARD" && g.rewardAmountCents != null ? `$${Math.round(g.rewardAmountCents / 100)} gift card` : g.rewardLabel || "Incentive";

type GoalWithParts = Awaited<ReturnType<typeof loadGoal>> & object;
function summarize(g: NonNullable<GoalWithParts>) {
  const parts = g.participants.map((p) => ({
    id: p.id,
    name: fullName(p.setter.firstName, p.setter.lastName),
    progressPct: Math.round(p.progressPct),
    currentValue: p.currentValue,
    achieved: p.achieved,
    rewardStatus: p.rewardStatus,
  }));
  return {
    id: g.id,
    title: g.title,
    targetText: goalTargetText(g),
    rewardText: rewardText(g),
    status: g.status,
    targetType: g.targetType,
    metric: g.metric,
    window: g.window,
    periodKey: g.periodKey,
    teamValue: g.teamValue,
    teamAchieved: g.teamAchieved,
    achievedCount: parts.filter((p) => p.achieved).length,
    totalCount: parts.length,
    participants: parts,
  };
}
export type GoalSummary = ReturnType<typeof summarize>;

export async function listGoalsForOffice(officeId: string) {
  const goals = await prisma.goal.findMany({
    where: { officeId, status: { in: ["ACTIVE", "COMPLETED"] } },
    include: { participants: { include: { setter: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return goals.map(summarize);
}

export async function listGoalsForGroup(orgId: string) {
  const goals = await prisma.goal.findMany({
    where: { organizationId: orgId, creatorScope: "GROUP", status: { in: ["ACTIVE", "COMPLETED"] } },
    include: { participants: { include: { setter: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return goals.map(summarize);
}

export async function listGoalsForSetter(setterId: string) {
  const parts = await prisma.goalParticipant.findMany({
    where: { setterId, goal: { status: { in: ["ACTIVE", "COMPLETED"] } } },
    include: { goal: true },
    orderBy: { updatedAt: "desc" },
  });
  return parts.map((p) => ({
    id: p.id,
    title: p.goal.title,
    targetText: goalTargetText(p.goal),
    rewardText: rewardText(p.goal),
    progressPct: Math.round(p.progressPct),
    achieved: p.achieved,
    rewardStatus: p.rewardStatus,
    targetType: p.goal.targetType,
    status: p.goal.status,
  }));
}

export type RewardQueueItem = {
  participantId: string;
  setterName: string;
  goalTitle: string;
  targetText: string;
  rewardText: string;
  achievedAt: Date | null;
  officeId: string | null;
};
async function queue(where: object): Promise<RewardQueueItem[]> {
  const parts = await prisma.goalParticipant.findMany({
    where: { achieved: true, rewardStatus: "PENDING", goal: where },
    include: { goal: true, setter: true },
    orderBy: { achievedAt: "asc" },
  });
  return parts.map((p) => ({
    participantId: p.id,
    setterName: fullName(p.setter.firstName, p.setter.lastName),
    goalTitle: p.goal.title,
    targetText: goalTargetText(p.goal),
    rewardText: rewardText(p.goal),
    achievedAt: p.achievedAt,
    officeId: p.goal.officeId,
  }));
}
export const rewardQueueForOffice = (officeId: string) => queue({ officeId });
export const rewardQueueForGroup = (orgId: string) => queue({ organizationId: orgId, creatorScope: "GROUP" });
