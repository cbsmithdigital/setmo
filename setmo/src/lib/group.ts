import { prisma } from "@/lib/db";
import { fullName } from "@/lib/format";
import { skillAveragesOverSessions } from "@/lib/office";
import { skillName, skillShort, rubricFor } from "@/lib/skills";
import type { AnalyticsRange } from "@/lib/queries";

const OFFICE_PALETTE = ["#a78bfa", "#34d399", "#fbbf24", "#60a5fa", "#fb7185", "#22d3ee", "#f472b6", "#f59e0b", "#c084fc", "#4ade80"];
const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export type OfficeRollup = {
  id: string;
  name: string;
  city: string | null;
  teamAvg: number;
  activeSetters: number;
  sessions: number;
  status: "top" | "steady" | "watch" | "quiet";
};

function officeStatus(avg: number, activeSetters: number): OfficeRollup["status"] {
  if (activeSetters === 0) return "quiet";
  if (avg >= 4.5) return "top";
  if (avg < 3.8) return "watch";
  return "steady";
}

// Portfolio rollup across a DSO/group's offices, computed in one sweep. When
// `officeIds` is passed the portfolio is scoped to exactly those offices (a Multi
// Practice Admin's curated subset); omit it for the whole organization.
export async function getGroupOverview(orgId: string, scopeOfficeIds?: string[]) {
  const [org, offices] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.office.findMany({ where: { organizationId: orgId, ...(scopeOfficeIds ? { id: { in: scopeOfficeIds } } : {}) }, select: { id: true, name: true, city: true } }),
  ]);
  const officeIds = offices.map((o) => o.id);

  const [setters, sessions] = await Promise.all([
    prisma.user.findMany({ where: { officeId: { in: officeIds }, role: "SETTER" }, select: { id: true, firstName: true, lastName: true, officeId: true } }),
    prisma.session.findMany({
      where: { officeId: { in: officeIds }, status: "SCORED", evaluation: { isNot: null } },
      orderBy: { startedAt: "desc" },
      include: { evaluation: { include: { skills: true } } },
    }),
  ]);

  // Per-setter rollup: average overall, and the skills of their latest call.
  const perSetter = new Map<string, { overalls: number[]; latestSkills: { skillKey: string; score: number }[] | null; officeId: string | null }>();
  for (const s of sessions) {
    const rec = perSetter.get(s.setterId) ?? { overalls: [], latestSkills: null, officeId: s.officeId };
    if (s.evaluation?.overallScore != null) rec.overalls.push(Number(s.evaluation.overallScore));
    if (!rec.latestSkills) rec.latestSkills = s.evaluation!.skills.map((k) => ({ skillKey: k.skillKey, score: Number(k.score) }));
    perSetter.set(s.setterId, rec);
  }

  const setterName = new Map(setters.map((u) => [u.id, fullName(u.firstName, u.lastName)]));
  const setterOffice = new Map(setters.map((u) => [u.id, u.officeId]));
  const officeName = new Map(offices.map((o) => [o.id, o.name]));

  // Per-office aggregates.
  const offByOffice = new Map<string, number[]>(); // office → per-setter averages
  for (const [setterId, rec] of perSetter) {
    if (!rec.overalls.length) continue;
    const oid = setterOffice.get(setterId) ?? rec.officeId;
    if (!oid) continue;
    const avg = rec.overalls.reduce((a, b) => a + b, 0) / rec.overalls.length;
    offByOffice.set(oid, [...(offByOffice.get(oid) ?? []), avg]);
  }

  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const sessionsThisWeek = sessions.filter((s) => s.startedAt >= weekAgo).length;
  const sessionsByOffice = new Map<string, number>();
  for (const s of sessions) sessionsByOffice.set(s.officeId!, (sessionsByOffice.get(s.officeId!) ?? 0) + 1);

  const officeRollups: OfficeRollup[] = offices
    .map((o) => {
      const avgs = offByOffice.get(o.id) ?? [];
      const teamAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
      return {
        id: o.id,
        name: o.name,
        city: o.city,
        teamAvg,
        activeSetters: avgs.length,
        sessions: sessionsByOffice.get(o.id) ?? 0,
        status: officeStatus(teamAvg, avgs.length),
      };
    })
    .sort((a, b) => b.teamAvg - a.teamAvg);

  const active = officeRollups.filter((o) => o.activeSetters > 0);
  const orgAvg = active.length ? active.reduce((a, o) => a + o.teamAvg, 0) / active.length : 0;

  // Org-wide skill heatmap — averaged over this month's real calls across every
  // office (not each setter's last call), so it reflects current group-wide skill.
  const now2 = new Date();
  const heatmap = await skillAveragesOverSessions(officeIds, { from: new Date(now2.getFullYear(), now2.getMonth(), 1), to: now2 });

  // Top performers across the whole group.
  const topPerformers = [...perSetter.entries()]
    .filter(([, r]) => r.overalls.length >= 2)
    .map(([id, r]) => ({
      name: setterName.get(id) ?? "Setter",
      office: officeName.get(setterOffice.get(id) ?? "") ?? "",
      avg: r.overalls.reduce((a, b) => a + b, 0) / r.overalls.length,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  const attention = officeRollups.filter((o) => o.status === "watch" || o.status === "quiet");

  return {
    orgName: org?.name ?? "Your group",
    officeCount: offices.length,
    orgAvg,
    totalActiveSetters: active.reduce((a, o) => a + o.activeSetters, 0),
    sessionsThisWeek,
    offices: officeRollups,
    heatmap,
    topPerformers,
    attention,
  };
}

// Windowed performance across EVERY location in a group — the office-team page
// one level up. Period vs the immediately-preceding equal window, with a
// per-location weekly trend and a location×skill heatmap matrix.
export async function getGroupAnalytics(orgId: string, current: AnalyticsRange, prior: AnalyticsRange | null, scopeOfficeIds?: string[]) {
  const [org, offices] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    prisma.office.findMany({ where: { organizationId: orgId, ...(scopeOfficeIds ? { id: { in: scopeOfficeIds } } : {}) }, select: { id: true, name: true, city: true } }),
  ]);
  const officeIds = offices.map((o) => o.id);
  const earliest = prior && prior.from < current.from ? prior.from : current.from;

  const sessions = await prisma.session.findMany({
    where: {
      officeId: { in: officeIds },
      status: "SCORED",
      durationSeconds: { gte: 60 },
      startedAt: { gte: earliest, lte: current.to },
      evaluation: { isNot: null },
    },
    orderBy: { startedAt: "asc" },
    include: { evaluation: { include: { skills: true } } },
  });
  const real = sessions.filter((s) => s.evaluation!.skills.length > 0 && s.evaluation!.overallScore != null);
  const inR = (d: Date, r: AnalyticsRange) => d >= r.from && d <= r.to;
  const cur = real.filter((s) => inR(s.startedAt, current));
  const pri = prior ? real.filter((s) => inR(s.startedAt, prior)) : [];
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const r1 = (n: number) => Number(n.toFixed(1));
  const order = rubricFor("IMPLANT").map((s) => s.key);

  // weekly (or coarser) buckets across the current window for trend lines
  const span = Math.max(1, current.to.getTime() - current.from.getTime());
  const days = span / 86400_000;
  const nBuckets = Math.min(12, Math.max(2, Math.ceil(days / 7)));
  const bucketMs = span / nBuckets;
  const bucketIdx = (d: Date) => Math.min(nBuckets - 1, Math.max(0, Math.floor((d.getTime() - current.from.getTime()) / bucketMs)));
  const bucketLabels = Array.from({ length: nBuckets }, (_, i) => shortDate(new Date(current.from.getTime() + i * bucketMs)));

  type S = (typeof cur)[number];
  const groupBy = <K>(arr: S[], keyOf: (s: S) => K) => {
    const m = new Map<K, S[]>();
    for (const s of arr) {
      const k = keyOf(s);
      const a = m.get(k) ?? [];
      a.push(s);
      m.set(k, a);
    }
    return m;
  };
  const overallsOf = (set: S[]) => set.map((s) => Number(s.evaluation!.overallScore));
  const skillAvgsOf = (set: S[]) => {
    const sums = new Map<string, { t: number; n: number }>();
    for (const s of set)
      for (const k of s.evaluation!.skills) {
        const c = sums.get(k.skillKey) ?? { t: 0, n: 0 };
        c.t += Number(k.score);
        c.n++;
        sums.set(k.skillKey, c);
      }
    return sums;
  };

  const curByOffice = groupBy(cur, (s) => s.officeId!);
  const priByOffice = groupBy(pri, (s) => s.officeId!);

  const locations = offices
    .map((o) => {
      const c = curByOffice.get(o.id) ?? [];
      const p = priByOffice.get(o.id) ?? [];
      const avg = r1(mean(overallsOf(c)));
      const prev = r1(mean(overallsOf(p)));
      const hasPrior = p.length > 0;
      // bucketed trend within window
      const buckets: number[][] = Array.from({ length: nBuckets }, () => []);
      for (const s of c) buckets[bucketIdx(s.startedAt)].push(Number(s.evaluation!.overallScore));
      const trend = buckets.map((b) => (b.length ? r1(mean(b)) : null));
      return {
        id: o.id,
        name: o.name,
        city: o.city,
        avg,
        prev,
        delta: hasPrior ? r1(avg - prev) : 0,
        hasPrior,
        sessions: c.length,
        activeSetters: new Set(c.map((s) => s.setterId)).size,
        status: officeStatus(avg, c.length),
        trend, // (number|null)[] — gaps where a bucket had no calls
        skillAvg: skillAvgsOf(c),
      };
    })
    .sort((a, b) => b.avg - a.avg);

  const orgAvg = r1(mean(overallsOf(cur)));
  const orgPrev = r1(mean(overallsOf(pri)));
  const orgSkill = skillAvgsOf(cur);
  const skills = order
    .filter((k) => orgSkill.has(k))
    .map((k) => ({ key: k, name: skillName(k), avg: r1(orgSkill.get(k)!.t / orgSkill.get(k)!.n) }));
  const ranked = [...skills].sort((a, b) => b.avg - a.avg);

  // location × skill heatmap matrix (active locations only)
  const matrixSkills = order.map((k) => ({ key: k, short: skillShort(k) }));
  const matrixRows = locations
    .filter((l) => l.sessions > 0)
    .map((l) => ({
      id: l.id,
      name: l.name,
      avg: l.avg,
      cells: order.map((k) => {
        const c = l.skillAvg.get(k);
        return { key: k, score: c ? r1(c.t / c.n) : null };
      }),
    }));

  // per-location weekly trend lines for the score-over-time chart
  const activeForChart = locations.filter((l) => l.sessions > 0);
  const series = activeForChart.map((l, i) => ({ key: l.id, name: l.name, color: OFFICE_PALETTE[i % OFFICE_PALETTE.length] }));
  const points: Record<string, number | string | null>[] = bucketLabels.map((label, bi) => {
    const row: Record<string, number | string | null> = { label };
    for (const l of activeForChart) row[l.id] = l.trend[bi];
    return row;
  });

  return {
    orgName: org?.name ?? "Your group",
    officeCount: offices.length,
    orgAvg,
    orgPrev,
    orgDelta: pri.length ? r1(orgAvg - orgPrev) : 0,
    hasPrior: pri.length > 0,
    activeLocations: locations.filter((l) => l.sessions > 0).length,
    activeSetters: new Set(cur.map((s) => s.setterId)).size,
    totalSessions: cur.length,
    topSkills: ranked.slice(0, 2),
    gapSkills: ranked.slice(-2).reverse(),
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      city: l.city,
      avg: l.avg,
      prev: l.prev,
      delta: l.delta,
      hasPrior: l.hasPrior,
      sessions: l.sessions,
      activeSetters: l.activeSetters,
      status: l.status,
      trend: l.trend,
    })),
    matrix: { skills: matrixSkills, rows: matrixRows },
    points,
    series,
  };
}

// Everything the Group/DSO coach needs for grounding (scoped to officeIds if given).
export async function getGroupCoachContext(orgId: string, officeIds?: string[]) {
  return getGroupOverview(orgId, officeIds);
}

// ---------------------------------------------------------------------------
// MULTI PRACTICE ADMIN scoping. A MULTI_PRACTICE_ADMIN oversees a CURATED SUBSET
// of a group's offices — the offices on their OFFICE-scoped memberships with this
// role. A full GROUP_ADMIN / PLATFORM_ADMIN oversees the whole org (officeIds
// undefined = no filter). Everything is fail-closed: org-level features gate on
// GROUP_ADMIN, so a Multi Practice Admin is excluded unless explicitly granted.
// ---------------------------------------------------------------------------
type ScopeUser = { id: string; role: string; activeRole?: string; organizationId: string | null };

/** The office IDs a Multi Practice Admin is assigned to (constrained to their org). */
export async function mpaOfficeIds(userId: string, orgId: string | null): Promise<string[]> {
  const mems = await prisma.membership.findMany({ where: { userId, role: "MULTI_PRACTICE_ADMIN", scopeType: "OFFICE" }, select: { scopeId: true } });
  const ids = mems.map((m) => m.scopeId).filter((x): x is string => Boolean(x));
  if (!ids.length || !orgId) return [];
  const valid = await prisma.office.findMany({ where: { id: { in: ids }, organizationId: orgId }, select: { id: true } });
  return valid.map((o) => o.id);
}

/** Resolve the office allow-list for a group-surface user. `officeIds: undefined`
 *  means "every office in the org" (full DSO admin); an array is the curated set. */
export async function groupScope(user: ScopeUser): Promise<{ orgId: string | null; officeIds: string[] | undefined }> {
  const role = user.activeRole ?? user.role;
  const orgId = user.organizationId;
  if (role !== "MULTI_PRACTICE_ADMIN") return { orgId, officeIds: undefined };
  return { orgId, officeIds: await mpaOfficeIds(user.id, orgId) };
}

/** Drill-in guard: may this user open THIS office's detail? Platform → any;
 *  Multi Practice Admin → only offices in their set; group admin → any in-org. */
export async function canAccessGroupOffice(user: ScopeUser, officeId: string): Promise<boolean> {
  const role = user.activeRole ?? user.role;
  if (role === "PLATFORM_ADMIN") return true;
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { organizationId: true } });
  if (!office || office.organizationId !== user.organizationId) return false;
  if (role === "MULTI_PRACTICE_ADMIN") {
    return Boolean(await prisma.membership.findFirst({ where: { userId: user.id, role: "MULTI_PRACTICE_ADMIN", scopeType: "OFFICE", scopeId: officeId } }));
  }
  return role === "GROUP_ADMIN";
}
