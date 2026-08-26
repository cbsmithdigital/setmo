import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getServiceOptions, getAllowance } from "@/lib/queries";
import { getCallCenterBalance, callCenterOrgForAgent } from "@/lib/usage";
import { ServicePicker } from "@/components/ServicePicker";
import { AllowanceMeter } from "@/components/ui/widgets";

// Practice is open to every user type. Setters/office-admins/group-admins drill
// against their office; call-center agents + managers pick a served account and
// draw the pooled call-center balance. Everyone reps calls + gets Setty feedback.
export default async function PracticePage() {
  const user = await requireUser();
  const isCallCenter = Boolean(user.callCenterPodId) || user.role === "CALL_CENTER_ADMIN";

  if (isCallCenter) {
    const orgId = user.organizationId ?? (await callCenterOrgForAgent(user.id));
    // Which served offices they can practice for, by role.
    let offices: { id: string; name: string }[] = [];
    if (user.role === "SETTER") {
      const assignments = await prisma.agentOffice.findMany({ where: { userId: user.id }, select: { office: { select: { id: true, name: true } } }, orderBy: { office: { name: "asc" } } });
      offices = assignments.map((a) => a.office);
    } else if (user.callCenterPodId) {
      offices = await prisma.office.findMany({ where: { servedByPodId: user.callCenterPodId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    } else if (orgId) {
      offices = await prisma.office.findMany({ where: { servedByPod: { organizationId: orgId } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    }
    const accounts = await Promise.all(offices.map(async (o) => ({ officeId: o.id, officeName: o.name, services: await getServiceOptions(o.id) })));
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
          <div className="content"><div className="card card-pad"><p className="muted">No served offices to practice for yet.</p></div></div>
        )}
      </>
    );
  }

  // Setter / office admin / group admin: drill against their own office (a group
  // admin with no single office falls back to the org's first office).
  const officeId =
    user.officeId ??
    (user.organizationId
      ? (await prisma.office.findFirst({ where: { organizationId: user.organizationId }, select: { id: true }, orderBy: { createdAt: "asc" } }))?.id ?? null
      : null);

  if (!officeId) {
    return (
      <>
        <div className="topbar"><div className="tb-greet"><h1>Start a practice session</h1></div></div>
        <div className="content"><div className="card card-pad"><p className="muted">No practice office assigned to your account yet.</p></div></div>
      </>
    );
  }

  const [services, allowance] = await Promise.all([getServiceOptions(officeId), getAllowance(officeId)]);

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
