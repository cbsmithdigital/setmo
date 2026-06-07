import { requireUser } from "@/lib/auth";
import { getServiceOptions, getAllowance } from "@/lib/queries";
import { ServicePicker } from "@/components/ServicePicker";
import { AllowanceMeter } from "@/components/ui/widgets";

export default async function PracticePage() {
  const user = await requireUser();
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
          <AllowanceMeter poolUsed={allowance.poolUsed} poolTotal={allowance.poolTotal} />
        </div>
      </div>
      <ServicePicker services={services} />
    </>
  );
}
