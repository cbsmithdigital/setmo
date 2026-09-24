import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { pickCall, transcriptPayload, type DemoCall } from "@/lib/demo-content";
import { NEW_PATIENT_CALLS } from "@/lib/demo-new-patient-calls";
import { IMPLANT_RUBRIC_V1 } from "@/lib/packs/implant";
import { GENERAL_NP_RUBRIC_V1 } from "@/lib/packs/general-new-patient";
import { recomputeOfficeLeaderboard } from "@/lib/leaderboard";
import { updateSetterMemory } from "@/lib/memory";
import { activateGoal } from "@/lib/goals";
import { evaluateMinuteThresholds, getMinuteBalance } from "@/lib/usage";
import { grantDemoAccess } from "@/lib/partner-portal";
import { DEMO_OFFSET_PREFIX, DEMO_COMP_PREFIX, DEMO_PERSONA_DOMAIN } from "@/lib/demo-shared";
import type { ServiceKey } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// A partner's demo organization: two practices with a realistic couple of months
// of team history, so partners can learn SetMo and show it to prospects.
//
// buildPartnerDemo() both builds and RESETS it. A reset wipes everything that
// happened in the demo (the partner's own test calls included) and re-seeds fresh
// history dated relative to today — so the demo never looks stale or cluttered.
// Everyone on the partner's team gets a short history of their own too, so their
// setter view isn't empty the first time they open it.
//
// Minutes stay honest across resets: seeded history never touches the balance,
// but minutes the partner actually used on live demo calls stay used. That's what
// the internal offset row does (see offsetAfter below). The wipe, the re-seed and
// the offset happen in ONE transaction under a per-partner lock, so a reset that
// dies halfway — or two at once — can't leave the balance wrong.
//
// Safety: only this partner's demo ids (derived from the partner's id) with
// isDemo=true are ever touched, and the build refuses anything else — a real
// account, or another partner's demo. It never writes global tables (services,
// trainings, the global leaderboard).
// ---------------------------------------------------------------------------

type SetterPlan = { first: string; last: string; target: number; improve: number; calls: number; newPatient?: number };
type OfficePlan = {
  suffix: "a" | "b";
  name: string;
  city: string;
  startingMinutes: number;
  adjust: Record<string, number>;
  setters: SetterPlan[];
};

const ORG_NAME = "Riverbend Dental Group";

// The showcase practice is a general family practice that also places implants —
// the most common shape among the practices partners bring us.
const PLAN: OfficePlan[] = [
  {
    suffix: "a",
    name: "Riverbend Family Dental",
    city: "Boise, ID",
    startingMinutes: 200,
    adjust: {},
    setters: [
      { first: "Jordan", last: "Ellis", target: 4.5, improve: 0.4, calls: 10, newPatient: 0 },
      { first: "Priya", last: "Nair", target: 4.1, improve: 0.6, calls: 10, newPatient: 1 },
      { first: "Marcus", last: "Webb", target: 3.9, improve: 1.0, calls: 10 },
      { first: "Hannah", last: "Cole", target: 3.3, improve: 0.3, calls: 9, newPatient: 2 },
      { first: "Luis", last: "Ortega", target: 3.8, improve: 0.4, calls: 3 },
    ],
  },
  {
    suffix: "b",
    name: "Riverbend Dental — Eagle",
    city: "Eagle, ID",
    startingMinutes: 150,
    adjust: { discovery: -0.2, objection: 0.1 },
    setters: [
      { first: "Grace", last: "Lin", target: 4.3, improve: 0.5, calls: 8 },
      { first: "Caleb", last: "Stone", target: 3.7, improve: 0.6, calls: 8 },
      { first: "Nora", last: "Page", target: 3.4, improve: 0.4, calls: 7 },
    ],
  },
];

// Each partner user's own short history in the showcase practice.
const PARTNER_USER_PLAN = { target: 3.7, improve: 0.5, calls: 6 };
// At most this many partner users get a seeded history (keeps a reset quick);
// anyone past it starts empty.
const MAX_SEEDED_PARTNER_USERS = 25;

// A realistic implant-call skill SHAPE: rapport and closing strong, value and
// pain-point soft — the team-wide gap the demo's coaching story is built on.
const SHAPE: Record<string, number> = {
  rapport: 0.5, listening: 0.3, discovery: -0.1, painpoint: -0.5,
  objection: 0.0, confidence: 0.2, value: -0.7, closing: 0.3,
};

// How many days ago each of a setter's calls happened, newest first: dense in the
// last week so "this week" and "last 30 days" look alive, spread back ~2 months
// so trends and period-over-period comparisons have data.
const DAYS_AGO = [0.2, 1.1, 2.8, 5.5, 9, 14, 20, 27, 35, 44, 54];

// A call with no duration yet that started this recently may still be in
// progress — a reset leaves it alone so its minutes are still charged.
const IN_PROGRESS_MS = 2 * 3600_000;

const clamp = (n: number) => Math.max(1, Math.min(5, Number(n.toFixed(1))));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export type DemoBuildReport = {
  orgId: string;
  offices: { id: string; name: string; balanceMin: number }[];
  seededSessions: number;
  liveMinutesCleared: number;
  demoUsers: number;
};

/** Demo ids come from the partner's id: stable for the partner's lifetime and
 *  unique to it (a tracking code or a name can change, or collide). */
export function demoIds(partnerId: string) {
  const key = partnerId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  return {
    key,
    orgId: `demo-${key}-org`,
    officeId: (suffix: "a" | "b") => `demo-${key}-${suffix}`,
  };
}

export async function buildPartnerDemo(partnerId: string): Promise<DemoBuildReport> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, name: true } });
  if (!partner) throw new Error("Partner not found");
  const ids = demoIds(partner.id);
  const officeIds = PLAN.map((p) => ids.officeId(p.suffix));

  // ---- safety: never touch anything that isn't this partner's demo ----
  const existing = await prisma.office.findMany({ where: { id: { in: officeIds } }, select: { id: true, isDemo: true, stripeCustomerId: true, organizationId: true } });
  for (const o of existing) {
    if (!o.isDemo || o.stripeCustomerId) throw new Error(`Refusing to reset ${o.id}: it isn't a demo account.`);
    if (o.organizationId && o.organizationId !== ids.orgId) throw new Error(`Refusing to reset ${o.id}: it belongs to another organization.`);
  }
  const existingOrg = await prisma.organization.findUnique({ where: { id: ids.orgId }, select: { isDemo: true, stripeCustomerId: true } });
  if (existingOrg && (!existingOrg.isDemo || existingOrg.stripeCustomerId)) throw new Error("Refusing to reset: the org isn't a demo account.");
  const otherOwner = await prisma.partner.findFirst({ where: { demoOrganizationId: ids.orgId, NOT: { id: partnerId } }, select: { name: true } });
  if (otherOwner) throw new Error(`Refusing to reset: that demo belongs to ${otherOwner.name}.`);

  const now = Date.now();
  const [implantAgent, generalAgent] = await Promise.all([
    prisma.agent.findUnique({ where: { serviceType: "IMPLANT" }, select: { id: true } }),
    prisma.agent.findUnique({ where: { serviceType: "GENERAL" }, select: { id: true } }),
  ]);

  // ---- structure (upserted, so a reset keeps the same ids and links) ----
  await prisma.organization.upsert({
    where: { id: ids.orgId },
    update: { name: ORG_NAME, isDemo: true },
    create: { id: ids.orgId, name: ORG_NAME, type: "GROUP", isDemo: true },
  });
  for (const [i, p] of PLAN.entries()) {
    const officeId = ids.officeId(p.suffix);
    const data = {
      name: p.name,
      city: p.city,
      organizationId: ids.orgId,
      isDemo: true,
      isProspect: false,
      offerFraming: `${p.name}: free new-patient exam & x-rays; complimentary implant consultation.`,
      appointmentFraming: "A first visit with the doctor — exam, x-rays and a plan",
      depositPolicy: "No deposit to book",
    };
    await prisma.office.upsert({
      where: { id: officeId },
      update: data,
      // The showcase is created first, so it's the office demo users land in.
      create: { id: officeId, ...data, createdAt: new Date(now - (PLAN.length - i) * 1000) },
    });
    // Implants (live) plus New patient (in beta — piloted here so partners can show it).
    for (const svc of ["IMPLANT", "GENERAL"] as ServiceKey[]) {
      await prisma.officeService.upsert({
        where: { officeId_serviceType: { officeId, serviceType: svc } },
        update: { enabled: true, pilot: svc === "GENERAL" },
        create: { officeId, serviceType: svc, enabled: true, pilot: svc === "GENERAL" },
      });
    }
    await prisma.subscription.upsert({ where: { officeId }, update: { status: "ACTIVE" }, create: { officeId, status: "ACTIVE", plan: "MONTHLY" } });
  }

  // ---- link the partner and give their team access (before seeding, so each of
  // them gets a history of their own) ----
  await prisma.partner.update({ where: { id: partnerId }, data: { demoOrganizationId: ids.orgId } });
  const team = await prisma.user.findMany({
    where: { partnerId, status: { not: "DISABLED" } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const withAccess: string[] = [];
  for (const u of team) if (await grantDemoAccess(u.id, partnerId)) withAccess.push(u.id);

  // ---- the demo team (made-up people on a reserved domain) ----
  const personaEmail = (s: SetterPlan) => `${s.first}.${s.last}.${ids.key}@${DEMO_PERSONA_DOMAIN}`.toLowerCase();
  const personaIdsByOffice = new Map<string, string[]>();
  const personaIdByEmail = new Map<string, string>();
  for (const p of PLAN) {
    const officeId = ids.officeId(p.suffix);
    const staff: string[] = [];
    for (const s of p.setters) {
      const email = personaEmail(s);
      const user = await prisma.user.upsert({
        where: { email },
        update: { firstName: s.first, lastName: s.last, officeId, organizationId: ids.orgId, role: "SETTER", status: "ACTIVE", digestOptOut: true },
        create: { id: randomUUID(), email, firstName: s.first, lastName: s.last, officeId, organizationId: ids.orgId, role: "SETTER", status: "ACTIVE", digestOptOut: true },
        select: { id: true },
      });
      staff.push(user.id);
      personaIdByEmail.set(email, user.id);
    }
    personaIdsByOffice.set(officeId, staff);
  }

  // ---- the seed, computed up front ----
  const sessions: Record<string, unknown>[] = [];
  const evaluations: Record<string, unknown>[] = [];
  const skills: Record<string, unknown>[] = [];
  const seededSecByOffice = new Map<string, number>();

  function pushCall(c: {
    officeId: string; setterId: string; service: ServiceKey; agentId: string | null; call: DemoCall; overall: number;
    scores: Record<string, number>; rubricId: string; daysAgo: number; dur: number; booked: boolean;
  }) {
    const id = randomUUID();
    const evalId = randomUUID();
    const startedAt = new Date(now - c.daysAgo * 86400_000);
    const completedAt = new Date(startedAt.getTime() + c.dur * 1000);
    sessions.push({
      id, setterId: c.setterId, officeId: c.officeId, serviceType: c.service, agentId: c.agentId,
      kind: "PRACTICE", status: "SCORED", difficulty: "ADAPTIVE",
      // demoSeed marks seeded history — the next reset tells it apart from live use.
      personaSeed: { persona: c.call.persona, demoSeed: true },
      startedAt, completedAt, durationSeconds: c.dur,
    });
    evaluations.push({
      id: evalId, sessionId: id, rubricId: c.rubricId, overallScore: c.overall.toFixed(1),
      narrative: c.call.narrative, wins: c.call.wins, misses: c.call.misses, replacementPhrases: c.call.phrases,
      recommendedNextScenario: c.call.nextScenario, rawPayload: transcriptPayload(c.call, c.dur),
      booked: c.booked, scoredAt: new Date(completedAt.getTime() + 5000),
    });
    const rubric = c.rubricId === GENERAL_NP_RUBRIC_V1.id ? GENERAL_NP_RUBRIC_V1 : IMPLANT_RUBRIC_V1;
    for (const def of rubric.skills) {
      skills.push({ evaluationId: evalId, skillKey: def.key, tier: def.tier === "universal" ? "UNIVERSAL" : "SERVICE_SPECIFIC", score: (c.scores[def.key] ?? c.overall).toFixed(1) });
    }
    seededSecByOffice.set(c.officeId, (seededSecByOffice.get(c.officeId) ?? 0) + c.dur);
  }

  // Implant calls on a rising trend that ends at the setter's current level.
  function seedImplantHistory(officeId: string, setterId: string, plan: { target: number; improve: number; calls: number }, adjust: Record<string, number>, si: number) {
    const current: Record<string, number> = {};
    for (const k of Object.keys(SHAPE)) current[k] = clamp(plan.target + SHAPE[k] + (adjust[k] ?? 0));
    for (let j = 0; j < plan.calls; j++) {
      const frac = (j + 1) / plan.calls;
      const scores: Record<string, number> = {};
      for (const k of Object.keys(SHAPE)) {
        const start = current[k] - plan.improve;
        scores[k] = clamp(start + (current[k] - start) * frac);
      }
      const overall = clamp(mean(Object.values(scores)));
      const fromNewest = plan.calls - 1 - j;
      const daysAgo = (DAYS_AGO[fromNewest] ?? 55 + fromNewest) + si * 0.13;
      const dur = 330 + ((j * 37 + si * 23) % 150);
      const booked = overall >= 4.0 ? j % 5 !== 0 : j % 3 === 0;
      pushCall({ officeId, setterId, service: "IMPLANT", agentId: implantAgent?.id ?? null, call: pickCall(overall, j + si), overall, scores, rubricId: IMPLANT_RUBRIC_V1.id, daysAgo, dur, booked });
    }
  }

  const npSetterIds: string[] = [];
  for (const p of PLAN) {
    const officeId = ids.officeId(p.suffix);
    for (const [si, s] of p.setters.entries()) {
      const setterId = personaIdByEmail.get(personaEmail(s))!;
      seedImplantHistory(officeId, setterId, s, p.adjust, si);
      // One new-patient call for setters that have one — scored on its own rubric.
      if (s.newPatient != null) {
        const np = NEW_PATIENT_CALLS[s.newPatient];
        const overall = clamp(mean(Object.values(np.skills)));
        pushCall({ officeId, setterId, service: "GENERAL", agentId: generalAgent?.id ?? null, call: np, overall, scores: np.skills, rubricId: GENERAL_NP_RUBRIC_V1.id, daysAgo: 1.6 + si * 0.9, dur: 270 + si * 20, booked: np.booked });
        npSetterIds.push(setterId);
      }
    }
  }
  const showcaseId = ids.officeId("a");
  const seededPartnerUsers = withAccess.slice(0, MAX_SEEDED_PARTNER_USERS);
  for (const [i, userId] of seededPartnerUsers.entries()) {
    seedImplantHistory(showcaseId, userId, PARTNER_USER_PLAN, {}, PLAN[0].setters.length + i);
  }

  // ---- reset + re-seed + offset, atomically ----
  // Only sessions the office pool meters are reset (the offset accounts for
  // exactly those). A call still in progress, and group-coach calls metered to the
  // org wallet, are left alone.
  const resettable = {
    officeId: { in: officeIds },
    organizationId: null,
    callCenterOrgId: null,
    isAudit: false,
    kind: { not: "LIVE" as const },
    OR: [{ durationSeconds: { not: null } }, { startedAt: { lt: new Date(now - IN_PROGRESS_MS) } }],
  };
  // The demo's own people: its made-up team plus the partner's logins in it.
  const demoUserIds = (
    await prisma.user.findMany({
      where: { officeId: { in: officeIds }, OR: [{ email: { endsWith: `@${DEMO_PERSONA_DOMAIN}` } }, { partnerId }] },
      select: { id: true },
    })
  ).map((u) => u.id);

  const liveSecTotal = await prisma.$transaction(
    async (tx) => {
      // One reset per partner at a time; a second click waits, then runs cleanly.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"demo-reset:" + partnerId}))`;

      const prior = await tx.session.findMany({ where: resettable, select: { officeId: true, durationSeconds: true, personaSeed: true } });
      const priorOffsets = await tx.conversationBundle.findMany({
        where: { stripePaymentIntent: { in: officeIds.map((id) => DEMO_OFFSET_PREFIX + id) } },
        select: { officeId: true, minutesPurchased: true },
      });

      await tx.goal.deleteMany({ where: { OR: [{ organizationId: ids.orgId }, { officeId: { in: officeIds } }] } });
      await tx.leaderboardEntry.deleteMany({ where: { scope: "OFFICE", officeId: { in: officeIds } } });
      await tx.coachInsight.deleteMany({
        where: { OR: [{ scope: "OFFICE", subjectId: { in: officeIds } }, { scope: "GROUP", subjectId: ids.orgId }, { scope: "SETTER", subjectId: { in: demoUserIds } }] },
      });
      await tx.recommendation.deleteMany({ where: { setterId: { in: demoUserIds } } });
      await tx.setterMemory.deleteMany({ where: { setterId: { in: demoUserIds } } });
      await tx.session.deleteMany({ where: resettable });

      await tx.session.createMany({ data: sessions as never });
      await tx.evaluation.createMany({ data: evaluations as never });
      await tx.skillScore.createMany({ data: skills as never });

      // Minutes: seeded history is free; live demo usage stays used. The balance
      // is purchased − round(metered seconds / 60), so it's unchanged exactly when
      //   offsetAfter = offsetBefore − round(clearedSec / 60) + round(seededSec / 60)
      let live = 0;
      for (const p of PLAN) {
        const officeId = ids.officeId(p.suffix);
        const mine = prior.filter((s) => s.officeId === officeId);
        const clearedSec = mine.reduce((a, s) => a + (s.durationSeconds ?? 0), 0);
        live += mine.filter((s) => (s.personaSeed as { demoSeed?: boolean } | null)?.demoSeed !== true).reduce((a, s) => a + (s.durationSeconds ?? 0), 0);
        const offsetBefore = priorOffsets.find((o) => o.officeId === officeId)?.minutesPurchased ?? 0;
        const offsetAfter = offsetBefore - Math.round(clearedSec / 60) + Math.round((seededSecByOffice.get(officeId) ?? 0) / 60);
        const offsetRef = DEMO_OFFSET_PREFIX + officeId;
        await tx.conversationBundle.upsert({
          where: { stripePaymentIntent: offsetRef },
          update: { minutesPurchased: offsetAfter, minutesRemaining: offsetAfter },
          create: { officeId, minutesPurchased: offsetAfter, minutesRemaining: offsetAfter, hours: 0, amountCents: 0, stripePaymentIntent: offsetRef },
        });
        // The starting grant, once ever. Later top-ups are the super-admin's manual grants.
        const compRef = `${DEMO_COMP_PREFIX}${officeId}:initial`;
        if (!(await tx.conversationBundle.findUnique({ where: { stripePaymentIntent: compRef }, select: { id: true } }))) {
          await tx.conversationBundle.create({
            data: { officeId, minutesPurchased: p.startingMinutes, minutesRemaining: p.startingMinutes, hours: Math.round(p.startingMinutes / 60), amountCents: 0, stripePaymentIntent: compRef },
          });
        }
      }
      return live;
    },
    { maxWait: 20_000, timeout: 90_000 }
  );

  // ---- the rest of a realistic practice: goals, training impact, outcomes ----
  const showcaseStaff = personaIdsByOffice.get(showcaseId) ?? [];
  const partnerAdmin = await prisma.user.findFirst({
    where: { partnerId, OR: [{ role: "PARTNER_ADMIN" }, { memberships: { some: { role: "PARTNER_ADMIN" } } }] },
    select: { id: true },
  });
  const createdById = partnerAdmin?.id ?? showcaseStaff[0];
  const monthName = new Date(now).toLocaleString("en-US", { month: "long" });
  if (createdById) {
    const teamGoal = await prisma.goal.create({
      data: {
        creatorScope: "OFFICE", officeId: showcaseId, createdById,
        title: `Team to 4.0 in ${monthName}`, targetType: "TEAM", metric: "OVERALL_SCORE", comparator: "REACH",
        targetValue: 4.0, window: "THIS_MONTH", recurrence: "NONE", minQualifyingReps: 3,
        rewardType: "CUSTOM", rewardLabel: "Team lunch on the doctor", funderScope: "OFFICE", includeManager: true, status: "DRAFT",
      },
    });
    await activateGoal(teamGoal.id, []);
    const repGoal = await prisma.goal.create({
      data: {
        creatorScope: "OFFICE", officeId: showcaseId, createdById,
        title: "Value building to 4.0", targetType: "SETTER", metric: "SKILL_SCORE", skillKey: "value", comparator: "REACH",
        targetValue: 4.0, window: "THIS_MONTH", recurrence: "NONE", minQualifyingReps: 3,
        rewardType: "CUSTOM", rewardLabel: "First pick of next month's schedule", funderScope: "OFFICE", status: "DRAFT",
      },
    });
    await activateGoal(repGoal.id, showcaseStaff.slice(0, 4));
  }

  // Closed-loop training impact: two setters finished a training on a weak skill
  // a couple of weeks ago, and their calls have moved since.
  const impact = [
    { staffIndex: 2, skill: "painpoint", baseline: 2.6 },
    { staffIndex: 3, skill: "value", baseline: 2.1 },
  ];
  for (const it of impact) {
    const setterId = showcaseStaff[it.staffIndex];
    const training = await prisma.training.findFirst({ where: { targetSkillKey: it.skill, status: "PUBLISHED" }, select: { id: true, title: true } });
    if (!setterId || !training) continue;
    await prisma.recommendation.create({
      data: {
        setterId, trainingId: training.id, skillKey: it.skill,
        reason: `${it.skill === "value" ? "Value building" : "Pain-point exploration"} was lagging — assigned "${training.title}"`,
        status: "COMPLETED", baselineScore: it.baseline,
        baselineAt: new Date(now - 26 * 86400_000), completedAt: new Date(now - 12 * 86400_000),
      },
    });
  }

  const period = (monthsBack: number) => {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - monthsBack);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const outcomes = [
    { officeId: showcaseId, periodLabel: period(0), monthlyLeads: 38, consultsBooked: 21, casesStarted: 7, production: 46000, note: "Implant ads plus a new-patient special this month." },
    { officeId: showcaseId, periodLabel: period(1), monthlyLeads: 34, consultsBooked: 16, casesStarted: 5, production: 31000, note: null },
    { officeId: ids.officeId("b"), periodLabel: period(0), monthlyLeads: 22, consultsBooked: 11, casesStarted: null, production: null, note: null },
  ];
  for (const o of outcomes) {
    await prisma.officeOutcome.upsert({
      where: { officeId_periodLabel: { officeId: o.officeId, periodLabel: o.periodLabel } },
      update: { monthlyLeads: o.monthlyLeads, consultsBooked: o.consultsBooked, casesStarted: o.casesStarted, production: o.production, note: o.note },
      create: o,
    });
  }

  // ---- derived state, computed the way the app computes it ----
  const implantSetters = [...[...personaIdsByOffice.values()].flat(), ...seededPartnerUsers];
  for (const setterId of implantSetters) await updateSetterMemory(setterId, "IMPLANT");
  for (const setterId of npSetterIds) await updateSetterMemory(setterId, "GENERAL");
  for (const officeId of officeIds) await recomputeOfficeLeaderboard(officeId, "IMPLANT");

  const offices: DemoBuildReport["offices"] = [];
  for (const p of PLAN) {
    const officeId = ids.officeId(p.suffix);
    await prisma.office.update({ where: { id: officeId }, data: { minuteAlertStage: 0 } });
    await evaluateMinuteThresholds(officeId).catch(() => {});
    offices.push({ id: officeId, name: p.name, balanceMin: (await getMinuteBalance(officeId)).remainingMin });
  }

  return {
    orgId: ids.orgId,
    offices,
    seededSessions: sessions.length,
    liveMinutesCleared: Math.round(liveSecTotal / 60),
    demoUsers: withAccess.length,
  };
}
