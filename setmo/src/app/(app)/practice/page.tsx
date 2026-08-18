import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getServiceOptions, getAllowance } from "@/lib/queries";
import { getCallCenterBalance, callCenterOrgForAgent } from "@/lib/usage";
import { ServicePicker } from "@/components/ServicePicker";
import { AllowanceMeter } from "@/components/ui/widgets";

export default async function PracticePage() {
  const user = await requireUser();

  // Call-center phone agent: choose which served office (account) to practice for;
  // time draws the pooled call-center balance.
  if (user.callCenterPodId) {
    const [assignments, orgId] = await Promise.all([
      prisma.agentOffice.findMany({ where: { userId: user.id }, select: { office: { select: { id: true, name: true } } }, orderBy: { office: { name: "asc" } } }),
      callCenterOrgForAgent(user.id),
    ]);
    const accounts = await Promise.all(assignments.map(async (a) => ({ officeId: a.office.id, officeName: a.office.name, services: await getServiceOptions(a.office.id) })));
    const pool = orgId ? await getCallCenterBalance(orgId) : { purchasedMin: 0, usedMin: 0, remainingMin: 0 };
    return (
      <>
        <div className="topbar">
          <div className="tb-greet">
            <h1>Start a practice session</h1>
            <p>Pick the account you&apos;re calling for, then what to drill. The lead&apos;s persona stays hidden until the call begins.</p>
          </div>
          <div className="tb-right">
            <AllowanceMeter remainingMin={pool.remainingMin} purchasedMin={pool.purchasedMin} usedMin={pool.usedMin} />
          </div>
        </div>
        {accounts.length ? (
          <ServicePicker accounts={accounts} />
        ) : (
          <div className="content"><div className="card card-pad"><p className="muted">You&apos;re not assigned to any offices yet — ask your floor manager.</p></div></div>
        )}
      </>
    );
  }

  const [services, allowance] = await Promise.all([
    getServiceOptions(user.officeId!),
    getAllowance(user.officeId!),
  ]);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Start a practice session</h1>
          <p>Pick what you want to drill. You won&apos;t see the lead&apos;s persona until the call begins.</p>
        </div>
        <div className="tb-right">
          <AllowanceMeter remainingMin={allowance.remainingMin} purchasedMin={allowance.purchasedMin} usedMin={allowance.usedMin} />
        </div>
      </div>
      <ServicePicker services={services} />
    </>
  );
}
