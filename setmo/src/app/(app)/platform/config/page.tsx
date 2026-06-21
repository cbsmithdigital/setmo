import { requireRole } from "@/lib/auth";
import { getPlatformConfig } from "@/lib/config";
import { ConfigEditor } from "@/components/platform/ConfigEditor";

export default async function PlatformConfigPage() {
  await requireRole("PLATFORM_ADMIN"); // Super-Admin only
  const config = await getPlatformConfig();

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Configuration</h1>
          <p>Pricing, thresholds, and alert settings. Super-Admin only · changes are audit-logged.</p>
        </div>
      </div>
      <div className="content">
        <ConfigEditor config={config} />
      </div>
    </>
  );
}
