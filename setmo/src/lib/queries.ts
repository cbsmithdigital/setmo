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

  const scored = sessions.filter((s) => s.evaluation);
  const n = scored.length;

  // Per-skill score series in chronological order.
  const seriesBySkill = new Map<string, number[]>();
  const overallSeries: number[] = [];
  for (const s of scored) {
    overallSeries.push(s.evaluation!.overallScore != null ? Number(s.evaluation!.overallScore) : 0);
    for (const sk of s.evaluation!.skills) {
      const arr = seriesBySkill.get(sk.skillKey) ?? [];
      arr.push(Number(sk.score));
      seriesBySkill.set(sk.skillKey, arr);
    }
  }

  // Chart points: overall + objection-handling line over time.
  const objectionSeries = seriesBySkill.get("objection") ?? [];
  const points = scored.map((_, i) => ({
    label: i === n - 1 ? "Now" : `S${i + 1}`,
    overall: overallSeries[i] ?? 0,
    objection: objectionSeries[i] ?? 0,
  }));

  // Latest snapshot.
  const latest = scored.length ? scored[scored.length - 1].evaluation!.skills : [];
  const snapshot = latest
    .map((sk) => {
      const arr = seriesBySkill.get(sk.skillKey) ?? [Number(sk.score)];
      const prev = arr.length > 1 ? arr[arr.length - 2] : Number(sk.score);
      return {
        key: sk.skillKey,
        name: skillName(sk.skillKey),
        tier: skillTier(sk.skillKey),
        score: Number(sk.score),
        prev,
        delta: Number((Number(sk.score) - prev).toFixed(1)),
        spark: arr.slice(-5),
      };
    })
    .sort((a, b) => {
      const order = rubricFor("IMPLANT").map((s) => s.key);
      return order.indexOf(a.key) - order.indexOf(b.key);
    });

  const universal = snapshot
    .filter((s) => s.tier === "universal")
    .map((s) => ({ key: s.key, name: s.name.split(" ")[0], value: s.score }));

  // Stats.
  const overallAvg = overallSeries.length ? overallSeries[overallSeries.length - 1] : 0;
  const overallDelta = overallSeries.length > 1 ? overallAvg - overallSeries[0] : 0;
  let mostImproved: { name: string; delta: number } | null = null;
  for (const [key, arr] of seriesBySkill) {
    if (arr.length < 2) continue;
    const d = arr[arr.length - 1] - arr[0];
    if (!mostImproved || d > mostImproved.delta) mostImproved = { name: skillName(key), delta: d };
  }
  const practiceHours = scored.reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 3600;
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const repsThisWeek = scored.filter((s) => s.startedAt >= weekAgo).length;

  return {
    points,
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
  const { getStripe, isStripeConfigured, seatDiscount, planTotal, BUNDLES } = await import(
    "@/lib/stripe"
  );

  const [allowance, subscription, activeSetters, office] = await Promise.all([
    getAllowance(officeId),
    prisma.subscription.findUnique({ where: { officeId } }),
    prisma.user.count({ where: { officeId, role: "SETTER", status: "ACTIVE" } }),
    prisma.office.findUnique({ where: { id: officeId } }),
  ]);

  const seats = subscription?.seats ?? office?.seatCount ?? 1;
  const cadence = subscription?.cadence ?? "MONTHLY";
  const discount = seatDiscount(seats);

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
    seats,
    filled: activeSetters,
    cadence,
    pricePerSeat: Number(subscription?.pricePerSeat ?? 59.99),
    discountLabel: discount.label,
    monthlyTotal: planTotal(seats, "MONTHLY"),
    quarterlyTotal: planTotal(seats, "QUARTERLY"),
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

// ---------- session result ----------
export async function getSessionResult(sessionId: string, setterId: string) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, setterId },
    include: { evaluation: { include: { skills: true } } },
  });
  if (!session || !session.evaluation) return null;

  const e = session.evaluation;
  const rubricKeys = rubricFor(session.serviceType).map((s) => s.key);
  const skills = evalSkills(e.skills).sort(
    (a, b) => rubricKeys.indexOf(a.skillKey) - rubricKeys.indexOf(b.skillKey)
  );

  // previous session score for "up from"
  const prev = await prisma.session.findFirst({
    where: {
      setterId,
      status: "SCORED",
      startedAt: { lt: session.startedAt },
    },
    orderBy: { startedAt: "desc" },
    include: { evaluation: true },
  });

  return {
    sessionId: session.id,
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
  };
}
