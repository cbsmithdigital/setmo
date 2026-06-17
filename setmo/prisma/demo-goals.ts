// Demo goals across Meridian DSO so the Goals & rewards surfaces are populated:
// an office goal already achieved (populates the approval queue), an in-progress
// team goal, and group-set goals for a practice + specific setters. Re-runnable.
// Run: pnpm exec tsx prisma/demo-goals.ts
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { prisma } from "@/lib/db";
import { activateGoal } from "@/lib/goals";

async function setterId(email: string) {
  const u = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  return u?.id ?? null;
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: "Meridian DSO" } });
  if (!org) return console.log("Meridian DSO not found");
  const offices = await prisma.office.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } });
  const officeIds = offices.map((o) => o.id);
  const byName = (n: string) => offices.find((o) => o.name === n)!;
  const lena = await prisma.user.findFirst({ where: { email: "lena@brightworkdental.com" }, select: { id: true } });

  // wipe prior demo goals (cascades participants)
  await prisma.goal.deleteMany({ where: { OR: [{ organizationId: org.id }, { officeId: { in: officeIds } }] } });

  const brightwork = byName("Brightwork Dental");
  const summit = byName("Summit Dental Co.");
  const sam = await setterId("sam@brightworkdental.com");
  const theo = await setterId("theo@brightworkdental.com");
  const grace = await setterId("setter6@coastalsmiles.example");
  const bianca = await setterId("setter2@lakesideimplants.example");

  // 1) Office SETTER goal already met → lands in the approval queue.
  const g1 = await prisma.goal.create({
    data: {
      creatorScope: "OFFICE", officeId: brightwork.id, createdById: lena!.id,
      title: "March consistency push", targetType: "SETTER", metric: "REPS", comparator: "REACH",
      targetValue: 3, window: "THIS_MONTH", recurrence: "NONE", minQualifyingReps: 0,
      rewardType: "GIFT_CARD", rewardAmountCents: 2500, funderScope: "OFFICE", status: "DRAFT",
    },
  });
  await activateGoal(g1.id, [sam, theo].filter(Boolean) as string[]);

  // 2) Office TEAM goal in progress.
  const g2 = await prisma.goal.create({
    data: {
      creatorScope: "OFFICE", officeId: brightwork.id, createdById: lena!.id,
      title: "Team to 4.0 this month", targetType: "TEAM", metric: "OVERALL_SCORE", comparator: "REACH",
      targetValue: 4.0, window: "THIS_MONTH", recurrence: "MONTHLY", minQualifyingReps: 3,
      rewardType: "GIFT_CARD", rewardAmountCents: 4000, funderScope: "OFFICE", includeManager: true, status: "DRAFT",
    },
  });
  await activateGoal(g2.id, []);

  // 3) Group TEAM goal for a struggling practice.
  const g3 = await prisma.goal.create({
    data: {
      creatorScope: "GROUP", organizationId: org.id, officeId: summit.id, createdById: lena!.id,
      title: "Summit turnaround", targetType: "TEAM", metric: "OVERALL_SCORE", comparator: "REACH",
      targetValue: 3.6, window: "THIS_MONTH", recurrence: "NONE", minQualifyingReps: 3,
      rewardType: "GIFT_CARD", rewardAmountCents: 5000, funderScope: "GROUP", includeManager: false, status: "DRAFT",
    },
  });
  await activateGoal(g3.id, []);

  // 4) Group SETTER goal for top performers across locations (value building).
  const g4 = await prisma.goal.create({
    data: {
      creatorScope: "GROUP", organizationId: org.id, createdById: lena!.id,
      title: "Value-building champions", targetType: "SETTER", metric: "SKILL_SCORE", skillKey: "value",
      comparator: "REACH", targetValue: 4.0, window: "THIS_MONTH", recurrence: "NONE", minQualifyingReps: 3,
      rewardType: "CUSTOM", rewardLabel: "Half-day PTO", funderScope: "GROUP", status: "DRAFT",
    },
  });
  await activateGoal(g4.id, [grace, bianca].filter(Boolean) as string[]);

  // report
  const goals = await prisma.goal.findMany({ where: { OR: [{ organizationId: org.id }, { officeId: { in: officeIds } }] }, include: { participants: true } });
  for (const g of goals) {
    const hit = g.participants.filter((p) => p.achieved).length;
    console.log(`${g.title}: ${g.targetType} ${g.metric} → team ${g.teamValue ?? "-"} achieved ${g.teamAchieved}; ${hit}/${g.participants.length} participants hit; pending=${g.participants.filter((p) => p.rewardStatus === "PENDING").length}`);
  }
  console.log("✅ demo goals seeded");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
