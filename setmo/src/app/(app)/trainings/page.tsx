import { requireUser } from "@/lib/auth";
import { getSetterTrainings, getAllowance, getOperationsAssets } from "@/lib/queries";
import { AllowanceMeter } from "@/components/ui/widgets";
import { TrainingsClient } from "@/components/training/TrainingsClient";

export default async function TrainingsPage() {
  const user = await requireUser();
  const [trainings, allowance, operations] = await Promise.all([
    getSetterTrainings(user.id),
    getAllowance(user.officeId!),
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
