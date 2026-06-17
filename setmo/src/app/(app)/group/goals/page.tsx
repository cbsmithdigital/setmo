import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fullName } from "@/lib/format";
import { IMPLANT_RUBRIC } from "@/lib/skills";
import { listGoalsForGroup, rewardQueueForGroup } from "@/lib/goals";
import { GoalsManager } from "@/components/goals/GoalsManager";

export default async function GroupGoalsPage() {
  const user = await requireRole("GROUP_ADMIN", "PLATFORM_ADMIN");
  if (!user.organizationId) {
    return (
      <div className="content">
        <div className="card card-pad muted">No organization is assigned to your account yet.</div>
      </div>
    );
  }
  const orgId = user.organizationId;
  const [goals, queue, offices, setters] = await Promise.all([
    listGoalsForGroup(orgId),
    rewardQueueForGroup(orgId),
    prisma.office.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { role: "SETTER", status: "ACTIVE", office: { organizationId: orgId } }, select: { id: true, firstName: true, lastName: true, office: { select: { name: true } } } }),
  ]);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Goals &amp; rewards</h1>
          <p>Set goals across your locations — for a whole practice or specific setters — and reward results.</p>
        </div>
      </div>
      <div className="content">
        <GoalsManager
          scope="GROUP"
          goals={goals}
          queue={queue.map((q) => ({ ...q, achievedAt: q.achievedAt }))}
          setters={setters.map((s) => ({ id: s.id, name: fullName(s.firstName, s.lastName), officeName: s.office?.name }))}
          offices={offices}
          skills={IMPLANT_RUBRIC.map((s) => ({ key: s.key, name: s.name }))}
        />
      </div>
    </>
  );
}
