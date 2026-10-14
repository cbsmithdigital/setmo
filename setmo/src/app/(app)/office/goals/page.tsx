import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fullName } from "@/lib/format";
import { IMPLANT_RUBRIC } from "@/lib/skills";
import { listGoalsForOffice, rewardQueueForOffice } from "@/lib/goals";
import { getIncentiveProvider } from "@/lib/incentives";
import { giftCardAccess } from "@/lib/gift-cards";
import { GoalsManager } from "@/components/goals/GoalsManager";

export default async function OfficeGoalsPage() {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const officeId = user.officeId!;
  const [goals, queue, setters, giftCards] = await Promise.all([
    listGoalsForOffice(officeId),
    rewardQueueForOffice(officeId),
    prisma.user.findMany({ where: { officeId, role: "SETTER", status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true } }),
    giftCardAccess({ officeId }),
  ]);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Goals &amp; rewards</h1>
          <p>Set goals for your setters or the whole team, and send a reward when they hit them.</p>
        </div>
      </div>
      <div className="content">
        <GoalsManager
          scope="OFFICE"
          goals={goals}
          queue={queue.map((q) => ({ ...q, achievedAt: q.achievedAt }))}
          setters={setters.map((s) => ({ id: s.id, name: fullName(s.firstName, s.lastName) }))}
          offices={[]}
          skills={IMPLANT_RUBRIC.map((s) => ({ key: s.key, name: s.name }))}
          providerAutomated={getIncentiveProvider().automated}
          giftCards={{ enabled: giftCards.enabled, requestedAt: giftCards.requestedAt?.toISOString() ?? null }}
        />
      </div>
    </>
  );
}
