import { requireRole, getActiveRole } from "@/lib/auth";
import { listPartners } from "@/lib/partners";
import { PartnersAdmin } from "@/components/platform/PartnersAdmin";

export default async function PlatformPartnersPage() {
  const user = await requireRole("PLATFORM_ADMIN", "SUPPORT");
  const partners = await listPartners();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://setmo.growdental.ai";

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Partners</h1>
          <p>Review applications, approve partners, and set rev-share terms. Custom rates are Super-Admin only.</p>
        </div>
      </div>
      <div className="content">
        <PartnersAdmin partners={partners} isSuper={getActiveRole(user) === "PLATFORM_ADMIN"} appUrl={appUrl} />
      </div>
    </>
  );
}
