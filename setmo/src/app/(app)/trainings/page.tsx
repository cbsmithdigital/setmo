import { requireUser } from "@/lib/auth";
import { getSetterTrainings, getAllowance, getOperationsAssets } from "@/lib/queries";
import { getCallCenterBalance, callCenterOrgForAgent } from "@/lib/usage";
import { AllowanceMeter } from "@/components/ui/widgets";
import { TrainingsClient } from "@/components/training/TrainingsClient";

export default async function TrainingsPage() {
  const user = await requireUser();
  // Call-center agents have no office pool — show the shared call-center balance.
  const allowanceFor = user.callCenterPodId
    ? (async () => { const org = await callCenterOrgForAgent(user.id); return org ? await getCallCenterBalance(org) : { remainingMin: 0, purchasedMin: 0, usedMin: 0 }; })()
    : getAllowance(user.officeId!);
  const [trainings, allowance, operations] = await Promise.all([
    getSetterTrainings(user.id),
    allowanceFor,
    getOperationsAssets(),
  ]);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Trainings</h1>
          <p>Fresh coaching, picked from how you actually scored.</p>
        </div>
        <div className="tb-right">
          <AllowanceMeter remainingMin={allowance.remainingMin} purchasedMin={allowance.purchasedMin} usedMin={allowance.usedMin} />
        </div>
      </div>
      <TrainingsClient
        recommended={trainings.recommended}
        videos={trainings.videos}
        workbooks={trainings.workbooks}
        operations={operations}
      />
    </>
  );
}
