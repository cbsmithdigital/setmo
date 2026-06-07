import { requireRole } from "@/lib/auth";
import { getOfficeBilling } from "@/lib/queries";
import { BillingClient } from "@/components/billing/BillingClient";

export default async function OfficeBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ bundle?: string; sub?: string }>;
}) {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const { bundle, sub } = await searchParams;
  const data = await getOfficeBilling(user.officeId!);

  return (
    <BillingClient
      data={data}
      practiceName={user.office?.name ?? "your practice"}
      bundleStatus={bundle}
      subStatus={sub}
    />
  );
}
