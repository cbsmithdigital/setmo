import { prisma } from "@/lib/db";
import { fullName } from "@/lib/format";
import { skillName } from "@/lib/skills";
import { getCallCenterBalance } from "@/lib/usage";

// Agent-centric rollups for the call-center tenant: phone agents shared across
// many served offices, organized into floor-manager pods. Everything is scoped by
// session.callCenterOrgId (the pool) + session.officeId (which practice the call
// was FOR), so an agent's overall AND per-office slices both fall out naturally.

export function ccStatus(avg: number, sessions: number): "strong" | "steady" | "watch" | "quiet" {
  if (sessions === 0) return "quiet";
  if (avg >= 4.3) return "strong";
  if (avg >= 3.7) return "steady";
  return "watch";
}

type EvalSkill = { skillKey: string; score: unknown };
type LoadedSession = {
  setterId: string;
  officeId: string;
  startedAt: Date;
  durationSeconds: number | null;
  evaluation: { overallScore: unknown; skills: EvalSkill[] } | null;
};

function mean(a: number[]): number {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}
// Get-or-init a map entry (keeps the value's type intact vs. a `?? {literal}`).
function getOr<T>(m: Map<string, T>, k: string, init: () => T): T {
  let v = m.get(k);
  if (v === undefined) { v = init(); m.set(k, v); }
  return v;
}
function topWeak(skillTotals: Map<string, { sum: number; n: number }>): { top: string | null; weak: string | null } {
  const rows = [...skillTotals.entries()].map(([k, t]) => ({ k, avg: t.sum / t.n })).sort((a, b) => b.avg - a.avg);
  return { top: rows[0]?.k ?? null, weak: rows[rows.length - 1]?.k ?? null };
}

async function loadScope(orgId: string, podIds: string[]) {
  const [pods, agents, offices, sessions] = await Promise.all([
    prisma.pod.findMany({ where: { organizationId: orgId, id: { in: podIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { role: "SETTER", status: "ACTIVE", callCenterPodId: { in: podIds } }, select: { id: true, firstName: true, lastName: true, callCenterPodId: true } }),
    prisma.office.findMany({ where: { servedByPodId: { in: podIds } }, select: { id: true, name: true, city: true, servedByPodId: true } }),
    prisma.session.findMany({
      where: { callCenterOrgId: orgId, status: "SCORED", evaluation: { isNot: null }, setter: { callCenterPodId: { in: podIds } } },
      orderBy: { startedAt: "desc" },
      select: { setterId: true, officeId: true, startedAt: true, durationSeconds: true, evaluation: { select: { overallScore: true, skills: { select: { skillKey: true, score: true } } } } },
    }),
  ]);
  return { pods, agents, offices, sessions: sessions as LoadedSession[] };
}

export type CallCenterRollup = Awaited<ReturnType<typeof buildRollup>>;

async function buildRollup(orgId: string, podIds: string[]) {
  const { pods, agents, offices, sessions } = await loadScope(orgId, podIds);
  const podName = new Map(pods.map((p) => [p.id, p.name]));
  const officeName = new Map(offices.map((o) => [o.id, o.name]));
  const weekAgo = new Date(Date.now() - 7 * 86400_000);

  // Per-agent aggregation (+ per-office breakdown).
  type AgentAgg = { overalls: number[]; skill: Map<string, { sum: number; n: number }>; byOffice: Map<string, { overalls: number[]; last: Date | null }>; last: Date | null; trainingSec: number };
  const byAgent = new Map<string, AgentAgg>();
  const officeAgg = new Map<string, { overalls: number[]; agents: Set<string>; last: Date | null; sessions: number }>();
  const podSkill = new Map<string, { sum: number; n: number }>(); // scope-wide skill heatmap
  let sessionsThisWeek = 0;

  for (const s of sessions) {
    const ov = s.evaluation?.overallScore != null ? Number(s.evaluation.overallScore) : null;
    if (s.startedAt >= weekAgo) sessionsThisWeek++;
    // agent
    const aa = getOr(byAgent, s.setterId, () => ({ overalls: [], skill: new Map<string, { sum: number; n: number }>(), byOffice: new Map<string, { overalls: number[]; last: Date | null }>(), last: null as Date | null, trainingSec: 0 }));
    if (ov != null) aa.overalls.push(ov);
    aa.trainingSec += s.durationSeconds ?? 0;
    if (!aa.last || s.startedAt > aa.last) aa.last = s.startedAt;
    const off = getOr(aa.byOffice, s.officeId, () => ({ overalls: [], last: null as Date | null }));
    if (ov != null) off.overalls.push(ov);
    if (!off.last || s.startedAt > off.last) off.last = s.startedAt;
    for (const k of s.evaluation?.skills ?? []) {
      const t = getOr(aa.skill, k.skillKey, () => ({ sum: 0, n: 0 }));
      t.sum += Number(k.score); t.n++;
      const pt = getOr(podSkill, k.skillKey, () => ({ sum: 0, n: 0 }));
      pt.sum += Number(k.score); pt.n++;
    }
    // office
    const oa = getOr(officeAgg, s.officeId, () => ({ overalls: [], agents: new Set<string>(), last: null as Date | null, sessions: 0 }));
    if (ov != null) oa.overalls.push(ov);
    oa.agents.add(s.setterId); oa.sessions++;
    if (!oa.last || s.startedAt > oa.last) oa.last = s.startedAt;
  }

  const agentRows = agents.map((u) => {
    const aa = byAgent.get(u.id);
    const overall = aa ? Number(mean(aa.overalls).toFixed(1)) : 0;
    const { top, weak } = aa ? topWeak(aa.skill) : { top: null, weak: null };
    const perOffice = aa
      ? [...aa.byOffice.entries()].map(([oid, o]) => ({ officeId: oid, officeName: officeName.get(oid) ?? "Office", avg: Number(mean(o.overalls).toFixed(1)), sessions: o.overalls.length, last: o.last })).sort((a, b) => b.sessions - a.sessions)
      : [];
    return {
      id: u.id,
      name: fullName(u.firstName, u.lastName),
      podId: u.callCenterPodId,
      podName: u.callCenterPodId ? podName.get(u.callCenterPodId) ?? "" : "",
      overall,
      sessions: aa?.overalls.length ?? 0,
      trainingMin: Math.round((aa?.trainingSec ?? 0) / 60),
      officeCount: aa?.byOffice.size ?? 0,
      topSkill: top ? skillName(top) : null,
      weakSkill: weak ? skillName(weak) : null,
      last: aa?.last ?? null,
      status: ccStatus(overall, aa?.overalls.length ?? 0),
      perOffice,
    };
  }).sort((a, b) => b.overall - a.overall);

  const officeRows = offices.map((o) => {
    const oa = officeAgg.get(o.id);
    const avg = oa ? Number(mean(oa.overalls).toFixed(1)) : 0;
    return { id: o.id, name: o.name, city: o.city, podName: o.servedByPodId ? podName.get(o.servedByPodId) ?? "" : "", agents: oa?.agents.size ?? 0, sessions: oa?.sessions ?? 0, avg, status: ccStatus(avg, oa?.sessions ?? 0) };
  }).sort((a, b) => b.avg - a.avg);

  const podRows = pods.map((p) => {
    const pods_agents = agentRows.filter((a) => a.podId === p.id);
    const active = pods_agents.filter((a) => a.sessions > 0);
    return {
      id: p.id, name: p.name,
      agents: pods_agents.length,
      offices: officeRows.filter((o) => o.podName === p.name).length,
      avg: active.length ? Number(mean(active.map((a) => a.overall)).toFixed(1)) : 0,
      sessions: pods_agents.reduce((s, a) => s + a.sessions, 0),
    };
  }).sort((a, b) => b.avg - a.avg);

  const active = agentRows.filter((a) => a.sessions > 0);
  const ccAvg = active.length ? Number(mean(active.map((a) => a.overall)).toFixed(1)) : 0;
  const heatmap = [...podSkill.entries()].map(([k, t]) => ({ key: k, name: skillName(k), avg: Number((t.sum / t.n).toFixed(1)) }));
  const topAgents = [...agentRows].filter((a) => a.sessions >= 2).slice(0, 5).map((a) => ({ name: a.name, podName: a.podName, avg: a.overall }));

  return {
    pods: podRows,
    agents: agentRows,
    offices: officeRows,
    heatmap,
    topAgents,
    ccAvg,
    totalAgents: agents.length,
    activeAgents: active.length,
    sessionsThisWeek,
    attention: agentRows.filter((a) => a.status === "watch" || a.status === "quiet").map((a) => a.name),
  };
}

/** Senior-manager view: the whole call center (all pods). */
export async function getCallCenterOverview(orgId: string) {
  const [org, pods] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    prisma.pod.findMany({ where: { organizationId: orgId }, select: { id: true } }),
  ]);
  const rollup = await buildRollup(orgId, pods.map((p) => p.id));
  const pool = await getCallCenterBalance(orgId);
  return { name: org?.name ?? "Call center", pool, ...rollup };
}

/** Floor-manager view: a single pod. */
export async function getPodOverview(podId: string) {
  const pod = await prisma.pod.findUnique({ where: { id: podId }, select: { id: true, name: true, organizationId: true } });
  if (!pod) return null;
  const rollup = await buildRollup(pod.organizationId, [podId]);
  const pool = await getCallCenterBalance(pod.organizationId);
  return { name: pod.name, orgId: pod.organizationId, pool, ...rollup };
}

// ---------------------------------------------------------------------------
// SERVED-PRACTICE REPORTING (P3): a practice sees the CUMULATIVE stats of the
// call-center agents calling FOR them — scoped to THIS office's calls only
// (read-only; they can't see the agent's work for other practices).
// ---------------------------------------------------------------------------

/** The call-center agents who ran calls for `officeId`, with this-office stats. */
export async function getServedOfficeAgents(officeId: string) {
  const sessions = await prisma.session.findMany({
    where: { officeId, callCenterOrgId: { not: null }, status: "SCORED", evaluation: { isNot: null } },
    orderBy: { startedAt: "desc" },
    select: { setterId: true, startedAt: true, durationSeconds: true, setter: { select: { firstName: true, lastName: true } }, evaluation: { select: { overallScore: true, skills: { select: { skillKey: true, score: true } } } } },
  });
  if (!sessions.length) return { callCenterName: null as string | null, agents: [] as ServedAgentRow[] };

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { servedByPod: { select: { organization: { select: { name: true } } } } } });
  type Agg = { name: string; overalls: number[]; skill: Map<string, { sum: number; n: number }>; sec: number; last: Date | null };
  const byAgent = new Map<string, Agg>();
  for (const s of sessions) {
    const a = getOr(byAgent, s.setterId, () => ({ name: fullName(s.setter?.firstName, s.setter?.lastName), overalls: [], skill: new Map<string, { sum: number; n: number }>(), sec: 0, last: null as Date | null }));
    if (s.evaluation?.overallScore != null) a.overalls.push(Number(s.evaluation.overallScore));
    a.sec += s.durationSeconds ?? 0;
    if (!a.last || s.startedAt > a.last) a.last = s.startedAt;
    for (const k of s.evaluation?.skills ?? []) { const t = getOr(a.skill, k.skillKey, () => ({ sum: 0, n: 0 })); t.sum += Number(k.score); t.n++; }
  }
  const agents: ServedAgentRow[] = [...byAgent.entries()].map(([id, a]) => {
    const overall = Number(mean(a.overalls).toFixed(1));
    const { top, weak } = topWeak(a.skill);
    return { id, name: a.name, overall, sessions: a.overalls.length, trainingMin: Math.round(a.sec / 60), topSkill: top ? skillName(top) : null, weakSkill: weak ? skillName(weak) : null, last: a.last, status: ccStatus(overall, a.overalls.length) };
  }).sort((x, y) => y.overall - x.overall);

  return { callCenterName: office?.servedByPod?.organization?.name ?? null, agents };
}
type ServedAgentRow = { id: string; name: string; overall: number; sessions: number; trainingMin: number; topSkill: string | null; weakSkill: string | null; last: Date | null; status: ReturnType<typeof ccStatus> };

/** One call-center agent's stats + calls FOR a specific served office only. */
export async function getServedOfficeAgentDetail(officeId: string, agentId: string) {
  const sessions = await prisma.session.findMany({
    where: { officeId, setterId: agentId, callCenterOrgId: { not: null }, status: "SCORED", evaluation: { isNot: null } },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, durationSeconds: true, personaSeed: true, evaluation: { select: { overallScore: true, skills: { select: { skillKey: true, score: true } } } } },
  });
  if (!sessions.length) return null;
  const agent = await prisma.user.findUnique({ where: { id: agentId }, select: { firstName: true, lastName: true } });

  const overalls: number[] = [];
  const skill = new Map<string, { sum: number; n: number }>();
  let sec = 0;
  for (const s of sessions) {
    if (s.evaluation?.overallScore != null) overalls.push(Number(s.evaluation.overallScore));
    sec += s.durationSeconds ?? 0;
    for (const k of s.evaluation?.skills ?? []) { const t = getOr(skill, k.skillKey, () => ({ sum: 0, n: 0 })); t.sum += Number(k.score); t.n++; }
  }
  return {
    id: agentId,
    name: fullName(agent?.firstName, agent?.lastName),
    overall: Number(mean(overalls).toFixed(1)),
    sessions: overalls.length,
    trainingMin: Math.round(sec / 60),
    skills: [...skill.entries()].map(([k, t]) => ({ key: k, name: skillName(k), avg: Number((t.sum / t.n).toFixed(1)) })),
    recent: sessions.slice(0, 12).map((s) => ({ id: s.id, persona: (s.personaSeed as { persona?: string } | null)?.persona ?? "Practice lead", score: s.evaluation?.overallScore != null ? Number(s.evaluation.overallScore) : 0, startedAt: s.startedAt })),
  };
}

/** One agent: overall + per-office breakdown + skill profile + recent calls. */
export async function getAgentDetail(agentId: string) {
  const agent = await prisma.user.findFirst({
    where: { id: agentId, role: "SETTER" },
    select: { id: true, firstName: true, lastName: true, callCenterPodId: true, pod: { select: { name: true, organizationId: true } } },
  });
  if (!agent?.callCenterPodId) return null;

  const [sessions, offices] = await Promise.all([
    prisma.session.findMany({
      where: { setterId: agentId, callCenterOrgId: agent.pod!.organizationId, status: "SCORED", evaluation: { isNot: null } },
      orderBy: { startedAt: "desc" },
      select: { id: true, officeId: true, startedAt: true, durationSeconds: true, personaSeed: true, evaluation: { select: { overallScore: true, skills: { select: { skillKey: true, score: true } } } } },
    }),
    prisma.office.findMany({ where: { servedByPodId: agent.callCenterPodId }, select: { id: true, name: true } }),
  ]);
  const officeName = new Map(offices.map((o) => [o.id, o.name]));

  const overalls: number[] = [];
  const skill = new Map<string, { sum: number; n: number }>();
  const byOffice = new Map<string, { overalls: number[]; last: Date | null; sec: number }>();
  let trainingSec = 0;
  for (const s of sessions) {
    const ov = s.evaluation?.overallScore != null ? Number(s.evaluation.overallScore) : null;
    if (ov != null) overalls.push(ov);
    trainingSec += s.durationSeconds ?? 0;
    for (const k of s.evaluation?.skills ?? []) { const t = skill.get(k.skillKey) ?? { sum: 0, n: 0 }; t.sum += Number(k.score); t.n++; skill.set(k.skillKey, t); }
    const off = byOffice.get(s.officeId) ?? { overalls: [], last: null, sec: 0 };
    if (ov != null) off.overalls.push(ov);
    off.sec += s.durationSeconds ?? 0;
    if (!off.last || s.startedAt > off.last) off.last = s.startedAt;
    byOffice.set(s.officeId, off);
  }
  const skills = [...skill.entries()].map(([k, t]) => ({ key: k, name: skillName(k), avg: Number((t.sum / t.n).toFixed(1)) }));

  return {
    id: agent.id,
    name: fullName(agent.firstName, agent.lastName),
    podId: agent.callCenterPodId,
    podName: agent.pod?.name ?? "",
    orgId: agent.pod!.organizationId,
    overall: Number(mean(overalls).toFixed(1)),
    sessions: overalls.length,
    trainingMin: Math.round(trainingSec / 60),
    skills,
    perOffice: [...byOffice.entries()].map(([oid, o]) => ({ officeId: oid, officeName: officeName.get(oid) ?? "Office", avg: Number(mean(o.overalls).toFixed(1)), sessions: o.overalls.length, trainingMin: Math.round(o.sec / 60), last: o.last })).sort((a, b) => b.sessions - a.sessions),
    recent: sessions.slice(0, 10).map((s) => ({ id: s.id, officeName: officeName.get(s.officeId) ?? "Office", persona: (s.personaSeed as { persona?: string } | null)?.persona ?? "Practice lead", score: s.evaluation?.overallScore != null ? Number(s.evaluation.overallScore) : 0, startedAt: s.startedAt })),
  };
}
