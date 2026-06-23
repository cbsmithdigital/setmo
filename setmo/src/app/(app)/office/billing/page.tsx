import { requireRole } from "@/lib/auth";
import { getOfficeBilling } from "@/lib/queries";
import { getPricingConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { BillingClient } from "@/components/billing/BillingClient";

export default async function OfficeBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string; minutes?: string; activate?: string }>;
}) {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const { access, minutes, activate } = await searchParams;
  const [data, activeSetters, pricing] = await Promise.all([
    getOfficeBilling(user.officeId!),
    prisma.user.count({ where: { officeId: user.officeId!, role: "SETTER", status: "ACTIVE" } }),
    getPricingConfig(),
  ]);

  return (
    <BillingClient
      data={data}
      practiceName={user.office?.name ?? "your practice"}
      accessStatus={access}
      minutesStatus={minutes}
      activateStatus={activate}
      seatsFree={9999}
      recommendPeople={Math.max(1, activeSetters)}
      pricing={pricing}
    />
  );
}
