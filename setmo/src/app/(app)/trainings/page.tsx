import { requireUser } from "@/lib/auth";
import { getSetterTrainings, getAllowance } from "@/lib/queries";
import { AllowanceMeter } from "@/components/ui/widgets";
import { TrainingsClient } from "@/components/training/TrainingsClient";

export default async function TrainingsPage() {
  const user = await requireUser();
  const [trainings, allowance] = await Promise.all([
    getSetterTrainings(user.id),
    getAllowance(user.officeId!),
  ]);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Trainings</h1>
          <p>Fresh coaching, picked from how you actually scored.</p>
        </div>
        <div className="tb-right">
          <AllowanceMeter poolUsed={allowance.poolUsed} poolTotal={allowance.poolTotal} />
        </div>
      </div>
      <TrainingsClient
        recommended={trainings.recommended}
        videos={trainings.videos}
        workbooks={trainings.workbooks}
      />
    </>
  );
}
