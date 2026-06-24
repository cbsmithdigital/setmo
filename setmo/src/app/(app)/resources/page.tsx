import { requireRole } from "@/lib/auth";
import { getOperationsAssets } from "@/lib/queries";
import { ResourcesClient } from "@/components/training/ResourcesClient";

export default async function ResourcesPage() {
  await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const assets = await getOperationsAssets();
  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Resources</h1>
          <p>Operations videos, scripts, and documents for running your practice.</p>
        </div>
      </div>
      <ResourcesClient assets={assets} />
    </>
  );
}
