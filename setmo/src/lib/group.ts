import { prisma } from "@/lib/db";
import { skillName, skillTier, rubricFor } from "@/lib/skills";
import { fullName } from "@/lib/format";

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

// Portfolio rollup across every office in a DSO/group, computed in one sweep.
export async function getGroupOverview(orgId: string) {
  const [org, offices] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.office.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, city: true } }),
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

  // Org-wide skill heatmap (each active setter's latest call).
  const order = rubricFor("IMPLANT").map((s) => s.key);
  const heatSums = new Map<string, { total: number; n: number }>();
  for (const rec of perSetter.values()) {
    if (!rec.latestSkills) continue;
    for (const sk of rec.latestSkills) {
      const cur = heatSums.get(sk.skillKey) ?? { total: 0, n: 0 };
      cur.total += sk.score;
      cur.n += 1;
      heatSums.set(sk.skillKey, cur);
    }
  }
  const heatmap = [...heatSums.entries()]
    .map(([key, v]) => ({ key, name: skillName(key), tier: skillTier(key), avg: v.total / v.n }))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

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

// Everything the Group/DSO coach needs for grounding.
export async function getGroupCoachContext(orgId: string) {
  return getGroupOverview(orgId);
}
