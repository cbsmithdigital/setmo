import { requireUser } from "@/lib/auth";
import { listGoalsForSetter } from "@/lib/goals";
import { SetterGoals } from "@/components/goals/SetterGoals";

export default async function SetterGoalsPage() {
  const user = await requireUser();
  const goals = await listGoalsForSetter(user.id);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Goals &amp; rewards</h1>
          <p>Targets your team set for you — hit them to earn the reward.</p>
        </div>
      </div>
      <div className="content">
        <SetterGoals goals={goals} />
      </div>
    </>
  );
}
