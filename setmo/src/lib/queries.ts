import { prisma } from "@/lib/db";
import { skillName, skillTier, rubricFor, type SkillTierKey } from "@/lib/skills";
import { SERVICE_META, SERVICE_ORDER } from "@/lib/service-meta";
import { fullName, initialsOf } from "@/lib/format";
import type { ServiceKey } from "@/generated/prisma/client";

// ---------- allowance pool ----------
export async function getAllowance(officeId: string) {
  const period = await prisma.allowancePeriod.findFirst({
    where: { officeId },
    orderBy: { periodStart: "desc" },
  });
  if (!period) return { poolUsed: 0, poolTotal: 0, remainingSeconds: 0 };
  const total = Number(period.includedSeconds) + Number(period.bundleSeconds);
  const consumed = Number(period.consumedSeconds);
  return {
    poolUsed: consumed / 3600,
    poolTotal: total / 3600,
    remainingSeconds: Math.max(0, total - consumed),
  };
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

  // chronological scores for deltas
  const scored = [...sessions].reverse(); // oldest -> newest
  const scoreOf = (s: (typeof sessions)[number]) =>
    s.evaluation?.overallScore != null ? Number(s.evaluation.overallScore) : 0;

  const recent = sessions.map((s) => {
    const idx = scored.findIndex((x) => x.id === s.id);
    const prev = idx > 0 ? scoreOf(scored[idx - 1]) : null;
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

  // latest skill snapshot
  const latest = sessions.find((s) => s.evaluation?.skills.length);
  const prevWithSkills = sessions
    .slice(1)
    .find((s) => s.evaluation?.skills.length);
  const skills = latest ? evalSkills(latest.evaluation!.skills) : [];
  const avg = skills.length
    ? skills.reduce((a, b) => a + b.score, 0) / skills.length
    : 0;
  const prevAvg =
    prevWithSkills && prevWithSkills.evaluation
      ? prevWithSkills.evaluation.skills.reduce((a, b) => a + Number(b.score), 0) /
        prevWithSkills.evaluation.skills.length
      : avg;
  const best = skills.reduce<SkillRow | null>(
    (m, s) => (!m || s.score > m.score ? s : m),
    null
  );
  const focus = skills.reduce<SkillRow | null>(
    (m, s) => (!m || s.score < m.score ? s : m),
    null
  );

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
    avgDelta: Number((avg - prevAvg).toFixed(1)),
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
export async function getSetterProgress(userId: string, officeId: string) {
  const [sessions, allowance] = await Promise.all([
    prisma.session.findMany({
      where: { setterId: userId, status: "SCORED" },
      orderBy: { startedAt: "asc" }, // chronological
      include: { evaluation: { include: { skills: true } } },
    }),
    getAllowance(officeId),
  ]);

  // Only count sessions that actually produced skill scores — abandoned/short
  // calls with no rubric shouldn't drag the charts down to zero.
  const scored = sessions.filter((s) => (s.evaluation?.skills.length ?? 0) > 0);
  const n = scored.length;
  const avgOf = (a: number[]) =>
    a.length ? Number((a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)) : 0;

  // Per session: overall + a map of skillKey -> score, aligned by session (not
  // by a per-skill array — that's what caused the cross-skill mismatch).
  const rows = scored.map((s, i) => {
    const map = new Map<string, number>();
    for (const sk of s.evaluation!.skills) map.set(sk.skillKey, Number(sk.score));
    const overall =
      s.evaluation!.overallScore != null ? Number(s.evaluation!.overallScore) : avgOf([...map.values()]);
    return { label: i === n - 1 ? "Now" : `S${i + 1}`, overall, map };
  });

  const order = rubricFor("IMPLANT").map((s) => s.key);
  const histOf = (key: string) =>
    rows.map((r) => r.map.get(key)).filter((v): v is number => v != null);

  // Latest snapshot (current per-skill score + delta vs the previous session).
  const latestSkills = scored.length ? scored[scored.length - 1].evaluation!.skills : [];
  const snapshot = latestSkills
    .map((sk) => {
      const hist = histOf(sk.skillKey);
      const cur = Number(sk.score);
      const prev = hist.length > 1 ? hist[hist.length - 2] : cur;
      return {
        key: sk.skillKey,
        name: skillName(sk.skillKey),
        tier: skillTier(sk.skillKey),
        score: cur,
        prev,
        delta: Number((cur - prev).toFixed(1)),
        spark: hist.slice(-5),
      };
    })
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  const universal = snapshot
    .filter((s) => s.tier === "universal")
    .map((s) => ({ key: s.key, name: s.name.split(" ")[0], value: s.score }));

  // Chart series: overall + current top skill + the two lowest (focus) skills.
  const byScore = [...snapshot].sort((a, b) => a.score - b.score);
  const lowest = byScore.slice(0, 2);
  const topSkill = byScore[byScore.length - 1];
  const series: { key: string; name: string; color: string }[] = [
    { key: "overall", name: "Overall", color: "#34d399" },
  ];
  if (topSkill && !lowest.some((l) => l.key === topSkill.key)) {
    series.push({ key: topSkill.key, name: topSkill.name, color: "#a78bfa" });
  }
  const focusColors = ["#fbbf24", "#fb7185"];
  lowest.forEach((l, i) => series.push({ key: l.key, name: l.name, color: focusColors[i] ?? "#94a3b8" }));

  const points = rows.map((r) => {
    const p: Record<string, number | string | null> = {
      label: r.label,
      overall: Number(r.overall.toFixed(1)),
    };
    for (const s of series) {
      if (s.key === "overall") continue;
      const v = r.map.get(s.key);
      p[s.key] = v != null ? v : null;
    }
    return p;
  });

  // Stats.
  const overalls = rows.map((r) => r.overall);
  const overallAvg = overalls.length ? overalls[overalls.length - 1] : 0;
  const overallDelta = overalls.length > 1 ? overallAvg - overalls[0] : 0;
  let mostImproved: { name: string; delta: number } | null = null;
  for (const key of order) {
    const hist = histOf(key);
    if (hist.length < 2) continue;
    const d = hist[hist.length - 1] - hist[0];
    if (!mostImproved || d > mostImproved.delta) mostImproved = { name: skillName(key), delta: d };
  }
  const practiceHours = scored.reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 3600;
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const repsThisWeek = scored.filter((s) => s.startedAt >= weekAgo).length;

  return {
    points,
    series,
    universal,
    snapshot,
    stats: {
      overallAvg,
      overallDelta: Number(overallDelta.toFixed(1)),
      mostImproved,
      totalReps: n,
      repsThisWeek,
      practiceHours,
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
    prisma.training.findMany({ where: { status: "PUBLISHED" } }),
  ]);

  const recByTraining = new Map(recs.map((r) => [r.trainingId, r]));

  const recommended = recs
    .filter((r) => r.training.type === "VIDEO")
    .map((r) => ({
      id: r.training.id,
      title: r.training.title,
      mins: r.training.length,
      skill: skillName(r.skillKey),
      why: r.reason,
      status: r.status === "COMPLETED" ? "done" : "new",
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
    }));

  return { recommended, videos, workbooks };
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
  const { getStripe, isStripeConfigured, BUNDLES } = await import("@/lib/stripe");
  const { planTotal, foundersOpen, TIERS } = await import("@/lib/pricing");
  type PlanTier = import("@/lib/pricing").PlanTier;
  type Cadence = import("@/lib/pricing").Cadence;

  const [allowance, subscription, activeSetters, office] = await Promise.all([
    getAllowance(officeId),
    prisma.subscription.findUnique({ where: { officeId } }),
    prisma.user.count({ where: { officeId, role: "SETTER", status: "ACTIVE" } }),
    prisma.office.findUnique({ where: { id: officeId } }),
  ]);

  const seats = subscription?.seats ?? office?.seatCount ?? 1;
  const tier = (subscription?.planTier ?? null) as PlanTier | null;
  const isFounder = subscription?.isFounder ?? false;
  const cadence = (subscription?.cadence === "ANNUAL" ? "ANNUAL" : "QUARTERLY") as Cadence;
  // Current-plan config for displaying the charged total.
  const cfg = {
    tier: (tier ?? "TEAM") as PlanTier,
    founder: isFounder,
    seats,
    extraSetters: Math.max(0, seats - TIERS.PRACTICE.includedSetters),
  };

  // Pull recent invoices from Stripe when wired up; otherwise empty.
  let invoices: { date: string; desc: string; amount: string; status: string; url: string | null }[] = [];
  const customerId = subscription?.stripeCustomerId ?? office?.stripeCustomerId;
  if (isStripeConfigured() && customerId) {
    try {
      const list = await getStripe().invoices.list({ customer: customerId, limit: 6 });
      invoices = list.data.map((inv) => ({
        date: new Date((inv.created ?? 0) * 1000).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        desc: inv.lines.data[0]?.description ?? `${seats} seats · ${cadence.toLowerCase()}`,
        amount: `$${((inv.amount_paid ?? inv.amount_due ?? 0) / 100).toFixed(2)}`,
        status: inv.status === "paid" ? "Paid" : (inv.status ?? "—"),
        url: inv.hosted_invoice_url ?? null,
      }));
    } catch {
      invoices = [];
    }
  }

  return {
    allowance,
    subscribed: subscription?.status === "ACTIVE",
    tier,
    tierName: tier ? TIERS[tier].name : null,
    isFounder,
    foundersOpen: foundersOpen(),
    seats,
    filled: activeSetters,
    cadence,
    quarterlyTotal: planTotal({ ...cfg, cadence: "QUARTERLY" }),
    annualTotal: planTotal({ ...cfg, cadence: "ANNUAL" }),
    nextInvoiceDate: subscription?.currentPeriodEnd
      ? subscription.currentPeriodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null,
    bundles: BUNDLES,
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
type ResultViewer = { id: string; role: string; officeId: string | null };

export async function getSessionResult(sessionId: string, viewer: ResultViewer) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { evaluation: { include: { skills: true } }, setter: true },
  });
  if (!session || !session.evaluation) return null;

  // The setter owns their call; office/group/platform admins may view any call
  // in their office (read-only — setter-only actions are hidden in the UI).
  const isOwner = session.setterId === viewer.id;
  const isManager = ["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(viewer.role);
  const canView = isOwner || (isManager && session.officeId === viewer.officeId);
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
