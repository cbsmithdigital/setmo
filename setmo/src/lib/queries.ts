import { prisma } from "@/lib/db";
import { getMinuteBalance, lastPurchasedMinutes } from "@/lib/usage";
import { callShowRate } from "@/lib/audit";
import { skillName, skillTier, rubricFor, type SkillTierKey } from "@/lib/skills";
import { SERVICE_META, SERVICE_ORDER } from "@/lib/service-meta";
import { fullName, initialsOf } from "@/lib/format";
import type { ServiceKey } from "@/generated/prisma/client";

// ---------- allowance pool ----------
// Minute balance for a location (purchased − used, rolling). Field names kept
// minute-first; see getMinuteBalance in usage.ts for the source of truth.
export async function getAllowance(officeId: string) {
  return getMinuteBalance(officeId);
}

// ---------- service picker ----------
export async function getServiceOptions(officeId: string) {
  const [agents, officeServices] = await Promise.all([
    prisma.agent.findMany(),
    prisma.officeService.findMany({ where: { officeId } }),
  ]);
  const agentBy = new Map(agents.map((a) => [a.serviceType, a]));
  const enabled = new Set(
    officeServices.filter((s) => s.enabled).map((s) => s.serviceType)
  );

  return SERVICE_ORDER.map((key) => {
    const agent = agentBy.get(key);
    const skills = Array.isArray(agent?.rubricSkills)
      ? (agent!.rubricSkills as unknown[]).length
      : 0;
    const live = agent?.status === "LIVE" && enabled.has(key);
    return {
      key,
      name: SERVICE_META[key].name,
      desc: SERVICE_META[key].desc,
      value: SERVICE_META[key].value,
      skills,
      live,
    };
  });
}

// ---------- skill snapshot from an evaluation ----------
type SkillRow = { skillKey: string; score: number; tier: SkillTierKey; name: string };

function evalSkills(skills: { skillKey: string; score: unknown }[]): SkillRow[] {
  return skills.map((s) => ({
    skillKey: s.skillKey,
    score: Number(s.score),
    tier: skillTier(s.skillKey),
    name: skillName(s.skillKey),
  }));
}

// ---------- setter dashboard ----------
// ============================================================================
// Time-windowed setter analytics. Aggregates over a date range (not the latest
// call), compares to the immediately-preceding equal window, and EXCLUDES calls
// under a minute or with no rubric (hang-ups/interruptions don't count).
// ============================================================================
export type AnalyticsRange = { from: Date; to: Date };
const ANALYTICS_MIN_DURATION = 60;

const RANGE_LABEL: Record<string, string> = {
  "30d": "Last 30 days",
  month: "This month",
  lastmonth: "Last month",
  "60d": "Last 60 days",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  all: "All time",
  custom: "Custom range",
};

// Resolve a timeframe from URL search params (shared by the setter Progress page
// and the office team-member page). Default = this calendar month, matching the
// dashboard's "skill level · this month" so the same setter reads identically
// across the setter and office-manager views.
export function resolveAnalyticsRange(sp: { range?: string; from?: string; to?: string }): {
  key: string;
  range: AnalyticsRange;
  label: string;
} {
  const now = new Date();
  const key = sp.range ?? "month";
  if (key === "month") return { key, range: { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }, label: RANGE_LABEL.month };
  if (key === "lastmonth") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, -1); // last instant of previous month
    return { key, range: { from, to }, label: RANGE_LABEL.lastmonth };
  }
  if (key === "all") return { key, range: { from: new Date(2000, 0, 1), to: now }, label: RANGE_LABEL.all };
  if (key === "custom" && sp.from) {
    const from = new Date(sp.from);
    const to = sp.to ? new Date(sp.to + "T23:59:59") : now;
    return { key, range: { from, to }, label: RANGE_LABEL.custom };
  }
  const days = key === "3m" ? 90 : key === "6m" ? 180 : key === "60d" ? 60 : 30;
  const norm = key === "3m" || key === "6m" || key === "60d" ? key : "30d";
  return { key: norm, range: { from: new Date(now.getTime() - days * 86400_000), to: now }, label: RANGE_LABEL[norm] };
}

type SessionWithEval = {
  startedAt: Date;
  durationSeconds: number | null;
  personaSeed: unknown;
  id: string;
  evaluation: { overallScore: unknown; skills: { skillKey: string; score: unknown }[] } | null;
};
function isRealScored(s: SessionWithEval): boolean {
  return (
    !!s.evaluation &&
    (s.evaluation.skills?.length ?? 0) > 0 &&
    (s.durationSeconds ?? 0) >= ANALYTICS_MIN_DURATION &&
    s.evaluation.overallScore != null
  );
}
const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const SKILL_PALETTE = ["#a78bfa", "#fbbf24", "#fb7185", "#60a5fa", "#f472b6", "#22d3ee", "#f59e0b", "#c084fc"];

export async function getSetterAnalytics(
  setterId: string,
  current: AnalyticsRange,
  prior: AnalyticsRange | null,
  opts: { allSkills?: boolean } = {}
) {
  const earliest = prior && prior.from < current.from ? prior.from : current.from;
  const sessions = await prisma.session.findMany({
    where: { setterId, status: "SCORED", startedAt: { gte: earliest, lte: current.to } },
    orderBy: { startedAt: "asc" },
    include: { evaluation: { include: { skills: true } } },
  });
  const real = sessions.filter(isRealScored);
  const inR = (s: { startedAt: Date }, r: AnalyticsRange) => s.startedAt >= r.from && s.startedAt <= r.to;
  const cur = real.filter((s) => inR(s, current));
  const pri = prior ? real.filter((s) => inR(s, prior)) : [];

  const order = rubricFor("IMPLANT").map((s) => s.key);
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const skillAvgMap = (set: typeof cur) => {
    const sums = new Map<string, { t: number; n: number }>();
    for (const s of set) for (const sk of s.evaluation!.skills) {
      const c = sums.get(sk.skillKey) ?? { t: 0, n: 0 };
      c.t += Number(sk.score);
      c.n++;
      sums.set(sk.skillKey, c);
    }
    const m = new Map<string, number>();
    for (const [k, v] of sums) m.set(k, v.t / v.n);
    return m;
  };
  const curSkill = skillAvgMap(cur);
  const priSkill = skillAvgMap(pri);
  const skillIn = (s: typeof cur[number], key: string) => {
    const sk = s.evaluation!.skills.find((x) => x.skillKey === key);
    return sk ? Number(sk.score) : null;
  };

  const overallAvg = Number(mean(cur.map((s) => Number(s.evaluation!.overallScore))).toFixed(1));
  const overallPrev = Number(mean(pri.map((s) => Number(s.evaluation!.overallScore))).toFixed(1));
  const hasPrior = pri.length > 0;
  const overallDelta = hasPrior ? Number((overallAvg - overallPrev).toFixed(1)) : 0;

  const perSkill = order
    .filter((k) => curSkill.has(k))
    .map((k) => {
      const score = Number(curSkill.get(k)!.toFixed(1));
      const prev = priSkill.has(k) ? Number(priSkill.get(k)!.toFixed(1)) : null;
      const spark = cur.map((s) => skillIn(s, k)).filter((v): v is number => v != null).slice(-6);
      return { key: k, name: skillName(k), tier: skillTier(k), score, prev, delta: prev != null ? Number((score - prev).toFixed(1)) : 0, spark };
    });

  const best = perSkill.reduce<(typeof perSkill)[number] | null>((m, s) => (!m || s.score > m.score ? s : m), null);
  const focus = perSkill.reduce<(typeof perSkill)[number] | null>((m, s) => (!m || s.score < m.score ? s : m), null);
  let mostImproved: { name: string; delta: number } | null = null;
  for (const s of perSkill) {
    if (s.prev == null) continue;
    if (!mostImproved || s.delta > mostImproved.delta) mostImproved = { name: s.name, delta: s.delta };
  }

  // chart series. Default = overall + top + the two lowest (focused). allSkills =
  // overall + every rubric skill (the office team-member view).
  const series: { key: string; name: string; color: string }[] = [{ key: "overall", name: "Overall", color: "#34d399" }];
  if (opts.allSkills) {
    perSkill.forEach((s, i) => series.push({ key: s.key, name: s.name, color: SKILL_PALETTE[i % SKILL_PALETTE.length] }));
  } else {
    const byScore = [...perSkill].sort((a, b) => a.score - b.score);
    const lowest = byScore.slice(0, 2);
    const top = byScore[byScore.length - 1];
    if (top && !lowest.some((l) => l.key === top.key)) series.push({ key: top.key, name: top.name, color: "#a78bfa" });
    const focusColors = ["#fbbf24", "#fb7185"];
    lowest.forEach((l, i) => series.push({ key: l.key, name: l.name, color: focusColors[i] ?? "#94a3b8" }));
  }

  const points = cur.map((s, i) => {
    const p: Record<string, number | string | null> = {
      label: i === cur.length - 1 ? "Now" : shortDate(s.startedAt),
      overall: Number(Number(s.evaluation!.overallScore).toFixed(1)),
    };
    for (const sr of series) {
      if (sr.key === "overall") continue;
      p[sr.key] = skillIn(s, sr.key);
    }
    return p;
  });

  const universal = perSkill.filter((s) => s.tier === "universal").map((s) => ({ key: s.key, name: s.name.split(" ")[0], value: s.score }));
  const weekAgo = new Date(Date.now() - 7 * 86400_000);

  return {
    reps: cur.length,
    repsThisWeek: cur.filter((s) => s.startedAt >= weekAgo).length,
    hours: cur.reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 3600,
    overallAvg,
    overallPrev,
    overallDelta,
    hasPrior,
    perSkill,
    best,
    focus,
    mostImproved,
    series,
    points,
    universal,
  };
}

// First-run checklist for an invited setter — the core loop (rep → score →
// coaching), not account setup. Auto-completes from real activity; hides when done.
export async function getSetterOnboarding(setterId: string) {
  const [practiceCount, scoredCount, coachCount] = await Promise.all([
    prisma.session.count({ where: { setterId, kind: "PRACTICE" } }),
    prisma.session.count({ where: { setterId, status: "SCORED", evaluation: { isNot: null } } }),
    prisma.session.count({ where: { setterId, kind: "COACH" } }),
  ]);
  const steps = [
    { key: "rep", label: "Run your first practice call", desc: "Talk to a realistic AI patient — no real leads at risk", href: "/practice", cta: "Start", done: practiceCount >= 1 },
    { key: "score", label: "See your first score", desc: "Get graded on all 8 skills, with coaching notes", href: "/progress", cta: "View", done: scoredCount >= 1 },
    { key: "setty", label: "Get coached by Setty", desc: "Ask Setty to break down a call and what to fix next", href: "/coach", cta: "Coach me", done: coachCount >= 1 },
  ];
  return { steps, doneCount: steps.filter((s) => s.done).length, allDone: steps.every((s) => s.done) };
}

export async function getSetterHome(user: {
  id: string;
  officeId: string | null;
  firstName: string | null;
}) {
  const officeId = user.officeId!;
  const [allowance, sessions, board, rec] = await Promise.all([
    getAllowance(officeId),
    prisma.session.findMany({
      where: { setterId: user.id, status: "SCORED" },
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { evaluation: { include: { skills: true } } },
    }),
    prisma.leaderboardEntry.findMany({
      where: { scope: "OFFICE", officeId, serviceType: "IMPLANT" },
      orderBy: { rank: "asc" },
    }),
    prisma.recommendation.findFirst({
      where: { setterId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: { training: true },
    }),
  ]);

  // Recent list — real scored sessions only (≥1 min, has rubric), with the
  // session-to-session delta for the row.
  const realSessions = sessions.filter(isRealScored);
  const chron = [...realSessions].reverse(); // oldest -> newest
  const scoreOf = (s: (typeof sessions)[number]) =>
    s.evaluation?.overallScore != null ? Number(s.evaluation.overallScore) : 0;
  const recent = realSessions.map((s) => {
    const idx = chron.findIndex((x) => x.id === s.id);
    const prev = idx > 0 ? scoreOf(chron[idx - 1]) : null;
    const cur = scoreOf(s);
    return {
      id: s.id,
      persona: (s.personaSeed as { persona?: string } | null)?.persona ?? "Practice lead",
      when: s.startedAt,
      durationSeconds: s.durationSeconds ?? 0,
      score: cur,
      delta: prev != null ? Number((cur - prev).toFixed(1)) : 0,
    };
  });

  // Skill level = THIS MONTH's average vs LAST MONTH (period aggregate, not the
  // last call), so it reflects sustained progress instead of one noisy session.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = await getSetterAnalytics(user.id, { from: monthStart, to: now }, { from: prevMonthStart, to: monthStart });
  const skills = month.perSkill;
  const avg = month.overallAvg;
  const best = month.best;
  const focus = month.focus;

  // leaderboard names
  const subjectIds = board.map((b) => b.subjectId);
  const people = await prisma.user.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const peopleBy = new Map(people.map((p) => [p.id, p]));
  const leaderboard = board.map((b) => {
    const p = peopleBy.get(b.subjectId);
    return {
      rank: b.rank,
      name: fullName(p?.firstName, p?.lastName),
      initials: initialsOf(p?.firstName, p?.lastName),
      score: Number(b.value),
      movement: b.movement,
      me: b.subjectId === user.id,
      top: b.rank === 1,
    };
  });
  const myRank = leaderboard.find((l) => l.me)?.rank ?? null;

  // sessions this week
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const sessionsThisWeek = recent.filter((r) => r.when >= weekAgo).length;

  return {
    firstName: user.firstName ?? "there",
    allowance,
    recent,
    skills,
    avg,
    avgDelta: month.overallDelta,
    best,
    focus,
    leaderboard,
    myRank,
    sessionsThisWeek,
    recommendation: rec
      ? { training: rec.training.title, mins: rec.training.length, why: rec.reason }
      : null,
  };
}

// ---------- setter progress ----------
// `range` is the selected window; we always compare to the immediately-preceding
// equal-length window (so "this month vs last month" etc. just works).
export async function getSetterProgress(userId: string, officeId: string, range?: AnalyticsRange) {
  const now = new Date();
  const current: AnalyticsRange = range ?? { from: new Date(now.getTime() - 30 * 86400_000), to: now };
  const len = current.to.getTime() - current.from.getTime();
  const prior: AnalyticsRange = { from: new Date(current.from.getTime() - len), to: current.from };

  const [a, allowance, periodSessions] = await Promise.all([
    getSetterAnalytics(userId, current, prior, { allSkills: true }),
    getAllowance(officeId),
    prisma.session.findMany({
      where: { setterId: userId, status: "SCORED", startedAt: { gte: current.from, lte: current.to } },
      orderBy: { startedAt: "desc" },
      include: { evaluation: { include: { skills: true } } },
    }),
  ]);

  // Clickable session list for this period (newest first) with session-to-session delta.
  const realPeriod = periodSessions.filter(isRealScored);
  const chron = [...realPeriod].reverse();
  const scoreOf = (s: (typeof periodSessions)[number]) => (s.evaluation?.overallScore != null ? Number(s.evaluation.overallScore) : 0);
  const sessions = realPeriod.map((s) => {
    const idx = chron.findIndex((x) => x.id === s.id);
    const prev = idx > 0 ? scoreOf(chron[idx - 1]) : null;
    const cur = scoreOf(s);
    return {
      id: s.id,
      persona: (s.personaSeed as { persona?: string } | null)?.persona ?? "Practice lead",
      when: s.startedAt,
      durationSeconds: s.durationSeconds ?? 0,
      score: cur,
      delta: prev != null ? Number((cur - prev).toFixed(1)) : 0,
      showRate: callShowRate((s.evaluation?.skills ?? []).map((k) => ({ skillKey: k.skillKey, score: Number(k.score) }))),
    };
  });

  return {
    points: a.points,
    series: a.series,
    universal: a.universal,
    snapshot: a.perSkill,
    sessions,
    stats: {
      overallAvg: a.overallAvg,
      overallDelta: a.overallDelta,
      hasPrior: a.hasPrior,
      mostImproved: a.mostImproved,
      totalReps: a.reps,
      repsThisWeek: a.repsThisWeek,
      practiceHours: a.hours,
    },
    allowance,
  };
}

// ---------- setter trainings ----------
export async function getSetterTrainings(userId: string) {
  const [recs, trainings] = await Promise.all([
    prisma.recommendation.findMany({
      where: { setterId: userId, status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
      include: { training: true },
    }),
    prisma.training.findMany({ where: { status: "PUBLISHED", category: "SETTER" } }),
  ]);

  const recByTraining = new Map(recs.map((r) => [r.trainingId, r]));

  // Resolve a training's playable asset: external link as-is, uploaded file via
  // the auth-gated asset route, or none.
  const asset = (id: string, ref: string | null, thumb?: string | null) => {
    const external = !!ref && /^https?:\/\//i.test(ref);
    return { hasAsset: !!ref, external, assetUrl: ref ? (external ? ref : `/api/trainings/${id}/asset`) : null, thumbUrl: thumb ? `/api/trainings/${id}/asset?kind=thumb` : null };
  };

  const recommended = recs
    .filter((r) => r.training.type === "VIDEO")
    .map((r) => ({
      id: r.training.id,
      title: r.training.title,
      mins: r.training.length,
      skill: skillName(r.skillKey),
      why: r.reason,
      status: r.status === "COMPLETED" ? "done" : "new",
      ...asset(r.training.id, r.training.assetRef, r.training.thumbRef),
    }));

  const recommendedIds = new Set(recommended.map((r) => r.id));

  const videos = trainings
    .filter((t) => t.type === "VIDEO" && !recommendedIds.has(t.id))
    .map((t) => ({
      id: t.id,
      title: t.title,
      mins: t.length,
      skill: t.targetSkillKey ? skillName(t.targetSkillKey) : "All skills",
      why: t.description ?? "Sharpen a core skill.",
      status: recByTraining.get(t.id)?.status === "COMPLETED" ? "done" : "start",
      ...asset(t.id, t.assetRef, t.thumbRef),
    }));

  const workbooks = trainings
    .filter((t) => t.type === "WORKBOOK")
    .map((t) => ({
      id: t.id,
      title: t.title,
      pages: t.length,
      done: 0,
      desc: t.description ?? "",
      tag: t.targetSkillKey ? skillName(t.targetSkillKey) : "Core",
      ...asset(t.id, t.assetRef, t.thumbRef),
    }));

  return { recommended, videos, workbooks };
}

// Operations assets — videos & documents for office/group admins (not setters).
export async function getOperationsAssets() {
  const rows = await prisma.training.findMany({
    where: { status: "PUBLISHED", category: "OPERATIONS" },
    orderBy: [{ type: "asc" }, { title: "asc" }],
  });
  return rows.map((t) => {
    const ref = t.assetRef;
    const external = !!ref && /^https?:\/\//i.test(ref);
    return {
      id: t.id,
      title: t.title,
      desc: t.description ?? "",
      type: t.type as "VIDEO" | "WORKBOOK",
      length: t.length,
      hasAsset: !!ref,
      external,
      assetUrl: ref ? (external ? ref : `/api/trainings/${t.id}/asset`) : null,
      thumbUrl: t.thumbRef ? `/api/trainings/${t.id}/asset?kind=thumb` : null,
    };
  });
}

// ---------- office service catalog ----------
export async function getOfficeCatalog(officeId: string) {
  const [agents, officeServices, office] = await Promise.all([
    prisma.agent.findMany(),
    prisma.officeService.findMany({ where: { officeId } }),
    prisma.office.findUnique({ where: { id: officeId } }),
  ]);
  const agentBy = new Map(agents.map((a) => [a.serviceType, a]));
  const enabled = new Set(officeServices.filter((s) => s.enabled).map((s) => s.serviceType));

  const services = SERVICE_ORDER.map((key) => {
    const agent = agentBy.get(key);
    return {
      key,
      name: SERVICE_META[key].name,
      desc: SERVICE_META[key].desc,
      live: agent?.status === "LIVE",
      enabled: enabled.has(key),
    };
  });

  return {
    services,
    profile: {
      name: office?.name ?? "",
      city: office?.city ?? "",
      offerFraming: office?.offerFraming ?? "",
      appointmentFraming: office?.appointmentFraming ?? "",
      depositPolicy: office?.depositPolicy ?? "",
    },
  };
}

// ---------- office billing ----------
export async function getOfficeBilling(officeId: string) {
  const { getStripe, isStripeConfigured } = await import("@/lib/stripe");
  const { getPlatformConfig } = await import("@/lib/config");
  const cfg = await getPlatformConfig();
  const accessMonthly = cfg.accessMonthly;

  const [balance, subscription, office] = await Promise.all([
    getMinuteBalance(officeId),
    prisma.subscription.findUnique({ where: { officeId } }),
    prisma.office.findUnique({ where: { id: officeId } }),
  ]);

  // Recent invoices from Stripe (access charges + minute purchases) when wired up.
  let invoices: { date: string; desc: string; amount: string; status: string; url: string | null }[] = [];
  const customerId = subscription?.stripeCustomerId ?? office?.stripeCustomerId;
  if (isStripeConfigured() && customerId) {
    try {
      const list = await getStripe().invoices.list({ customer: customerId, limit: 8 });
      invoices = list.data.map((inv) => ({
        date: new Date((inv.created ?? 0) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        desc: inv.lines.data[0]?.description ?? "SetMo",
        amount: `$${((inv.amount_paid ?? inv.amount_due ?? 0) / 100).toFixed(2)}`,
        status: inv.status === "paid" ? "Paid" : (inv.status ?? "—"),
        url: inv.hosted_invoice_url ?? null,
      }));
    } catch {
      invoices = [];
    }
  }

  const active = subscription?.status === "ACTIVE";
  const plan = subscription?.plan === "ANNUAL" ? "annual" : "monthly";
  const accountDiscountPct = active ? (plan === "annual" ? cfg.annualTokenDiscountPct : cfg.monthlyTokenDiscountPct) : 0;

  // Sign-up promo (for not-yet-activated offices): bonus tokens per plan + the
  // deadline label, rendered on the activation card. Null once subscribed/ended,
  // and suppressed for offices that already consumed their one-per-office grant
  // (e.g. canceled → reactivating) so we never advertise an undeliverable bonus.
  const { promoInfo } = await import("@/lib/config");
  const { hasSignupBonusGrant } = await import("@/lib/usage");
  const promo = !active && !(await hasSignupBonusGrant(officeId)) ? promoInfo(cfg) : null;

  return {
    promo,
    balance,
    accessMonthly,
    annualAccess: Math.round(accessMonthly * 10 * 100) / 100, // 2 months free
    subscribed: active,
    accessStatus: subscription?.status ?? null,
    plan: plan as "monthly" | "annual",
    accountDiscountPct,
    monthlyDiscountPct: cfg.monthlyTokenDiscountPct,
    annualDiscountPct: cfg.annualTokenDiscountPct,
    autoTopUp: office?.autoTopUp ?? false,
    topUpMinutes: await lastPurchasedMinutes(officeId),
    nextInvoiceDate: subscription?.currentPeriodEnd
      ? subscription.currentPeriodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null,
    invoices,
  };
}

// ---------- office leaderboard ----------
export async function getOfficeLeaderboard(officeId: string, viewerId: string) {
  const board = await prisma.leaderboardEntry.findMany({
    where: { scope: "OFFICE", officeId, serviceType: "IMPLANT" },
    orderBy: { rank: "asc" },
  });
  const people = await prisma.user.findMany({
    where: { id: { in: board.map((b) => b.subjectId) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const by = new Map(people.map((p) => [p.id, p]));
  return board.map((b) => {
    const p = by.get(b.subjectId);
    return {
      rank: b.rank,
      name: fullName(p?.firstName, p?.lastName),
      initials: initialsOf(p?.firstName, p?.lastName),
      score: Number(b.value),
      movement: b.movement,
      me: b.subjectId === viewerId,
      top: b.rank === 1,
    };
  });
}

// ---------- global leaderboard (privacy: office/group standings only) ----------
export async function getGlobalLeaderboard(viewerOfficeId: string | null) {
  const board = await prisma.leaderboardEntry.findMany({
    where: { scope: "GLOBAL", serviceType: "IMPLANT" },
    orderBy: { rank: "asc" },
  });
  const offices = await prisma.office.findMany({
    where: { id: { in: board.map((b) => b.subjectId) } },
    include: { organization: true },
  });
  const by = new Map(offices.map((o) => [o.id, o]));

  const officeInitials = (name: string) =>
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return board.map((b) => {
    const o = by.get(b.subjectId);
    return {
      rank: b.rank,
      name: o?.name ?? "Practice",
      sub: o?.organization?.name ?? o?.city ?? "Independent",
      initials: o ? officeInitials(o.name) : "?",
      score: Number(b.value),
      movement: b.movement,
      me: viewerOfficeId != null && b.subjectId === viewerOfficeId,
      top: b.rank === 1,
    };
  });
}

// ---------- shared (public, by token) ----------
export async function getSharedRecording(token: string) {
  const session = await prisma.session.findUnique({
    where: { shareToken: token },
    include: { evaluation: { include: { skills: true } }, setter: true, office: true },
  });
  if (!session || !session.evaluation || !session.shareToken) return null;

  const e = session.evaluation;
  const order = rubricFor(session.serviceType).map((s) => s.key);
  const skills = evalSkills(e.skills).sort((a, b) => order.indexOf(a.skillKey) - order.indexOf(b.skillKey));

  const raw = e.rawPayload as { data?: { transcript?: unknown[] } } | null;
  const transcript = ((raw?.data?.transcript ?? []) as { role?: string; message?: string | null; time_in_call_secs?: number }[])
    .filter((t) => typeof t.message === "string" && t.message.trim().length > 0)
    .map((t) => ({ speaker: t.role === "user" ? ("you" as const) : ("lead" as const), text: (t.message as string).trim(), t: t.time_in_call_secs ?? 0 }));

  return {
    token,
    sessionId: session.id,
    setterName: fullName(session.setter?.firstName, session.setter?.lastName),
    officeName: session.office?.name ?? "",
    service: SERVICE_META[session.serviceType as ServiceKey].name,
    persona: (session.personaSeed as { persona?: string } | null)?.persona ?? "Practice lead",
    durationSeconds: session.durationSeconds ?? 0,
    when: session.startedAt,
    score: e.overallScore != null ? Number(e.overallScore) : 0,
    narrative: e.narrative ?? "",
    skills,
    wins: (e.wins as string[] | null) ?? [],
    misses: (e.misses as string[] | null) ?? [],
    phrases: (e.replacementPhrases as { from: string; to: string }[] | null) ?? [],
    transcript,
    audioAvailable: Boolean(session.audioPath),
  };
}

// ---------- saved recordings (Library) ----------
export async function getSavedRecordings(user: { id: string; role: string; officeId: string | null }) {
  const isAdmin = ["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role);
  const where = isAdmin
    ? { officeId: user.officeId ?? "", saved: true, kind: "PRACTICE" as const }
    : { setterId: user.id, saved: true, kind: "PRACTICE" as const };

  const sessions = await prisma.session.findMany({
    where,
    orderBy: { savedAt: "desc" },
    include: { evaluation: { select: { overallScore: true } }, setter: true },
  });

  return sessions.map((s) => ({
    id: s.id,
    persona: (s.personaSeed as { persona?: string } | null)?.persona ?? "Practice lead",
    service: SERVICE_META[s.serviceType as ServiceKey].name,
    score: s.evaluation?.overallScore != null ? Number(s.evaluation.overallScore) : null,
    when: s.savedAt ?? s.startedAt,
    durationSeconds: s.durationSeconds ?? 0,
    setterName: fullName(s.setter?.firstName, s.setter?.lastName),
    shared: Boolean(s.shareToken),
    shareToken: s.shareToken,
    audioAvailable: Boolean(s.audioPath),
    showSetter: isAdmin,
  }));
}

// ---------- session result ----------
type ResultViewer = { id: string; role: string; officeId: string | null; organizationId?: string | null; callCenterPodId?: string | null };

export async function getSessionResult(sessionId: string, viewer: ResultViewer) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { evaluation: { include: { skills: true } }, setter: true },
  });
  // The transcript is captured (evaluation row created) before scoring finishes;
  // only treat the call as ready once it's actually been scored.
  if (!session || !session.evaluation || !session.evaluation.scoredAt) return null;

  // The setter owns their call; office/group/platform admins may view any call
  // in their office (read-only — setter-only actions are hidden in the UI).
  const isOwner = session.setterId === viewer.id;
  const isManager = ["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(viewer.role);
  // A call-center senior manager can view any of the call center's agent calls; a
  // floor manager only their own pod's agents.
  const isCallCenterView = Boolean(
    session.callCenterOrgId &&
    viewer.organizationId &&
    viewer.organizationId === session.callCenterOrgId &&
    (viewer.role === "CALL_CENTER_ADMIN" ||
      (viewer.role === "CALL_CENTER_MANAGER" && viewer.callCenterPodId != null && viewer.callCenterPodId === session.setter?.callCenterPodId))
  );
  const canView = isOwner || (isManager && session.officeId === viewer.officeId) || isCallCenterView;
  if (!canView) return null;

  const e = session.evaluation;
  const rubricKeys = rubricFor(session.serviceType).map((s) => s.key);
  const skills = evalSkills(e.skills).sort(
    (a, b) => rubricKeys.indexOf(a.skillKey) - rubricKeys.indexOf(b.skillKey)
  );

  // previous session score for "up from" (relative to the call's owner)
  const prev = await prisma.session.findFirst({
    where: {
      setterId: session.setterId,
      status: "SCORED",
      startedAt: { lt: session.startedAt },
    },
    orderBy: { startedAt: "desc" },
    include: { evaluation: true },
  });

  // Transcript turns from the stored webhook payload.
  const raw = e.rawPayload as { data?: { transcript?: unknown[] } } | null;
  const rawTurns = (raw?.data?.transcript ?? []) as {
    role?: string;
    message?: string | null;
    time_in_call_secs?: number;
  }[];
  const transcript = rawTurns
    .filter((t) => typeof t.message === "string" && t.message.trim().length > 0)
    .map((t) => ({
      speaker: t.role === "user" ? ("you" as const) : ("lead" as const),
      text: (t.message as string).trim(),
      t: t.time_in_call_secs ?? 0,
    }));

  return {
    sessionId: session.id,
    isOwner,
    setterName: fullName(session.setter?.firstName, session.setter?.lastName),
    service: SERVICE_META[session.serviceType as ServiceKey].name,
    persona: (session.personaSeed as { persona?: string } | null)?.persona ?? "Practice lead",
    durationSeconds: session.durationSeconds ?? 0,
    score: e.overallScore != null ? Number(e.overallScore) : 0,
    prev: prev?.evaluation?.overallScore != null ? Number(prev.evaluation.overallScore) : null,
    showRate: callShowRate(skills.map((s) => ({ skillKey: s.skillKey, score: s.score }))),
    narrative: e.narrative ?? "",
    skills,
    wins: (e.wins as string[] | null) ?? [],
    misses: (e.misses as string[] | null) ?? [],
    phrases: (e.replacementPhrases as { from: string; to: string }[] | null) ?? [],
    personaCoaching: e.personaCoaching,
    nextScenario: e.recommendedNextScenario,
    transcript,
    audioAvailable: Boolean(session.audioPath),
    saved: session.saved,
    shareToken: session.shareToken,
  };
}
