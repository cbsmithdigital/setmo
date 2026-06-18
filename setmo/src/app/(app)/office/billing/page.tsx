import { requireRole } from "@/lib/auth";
import { getOfficeBilling } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { BillingClient } from "@/components/billing/BillingClient";

export default async function OfficeBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string; minutes?: string }>;
}) {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const { access, minutes } = await searchParams;
  const [data, activeSetters] = await Promise.all([
    getOfficeBilling(user.officeId!),
    prisma.user.count({ where: { officeId: user.officeId!, role: "SETTER", status: "ACTIVE" } }),
  ]);

  return (
    <BillingClient
      data={data}
      practiceName={user.office?.name ?? "your practice"}
      accessStatus={access}
      minutesStatus={minutes}
      seatsFree={9999}
      recommendPeople={Math.max(1, activeSetters)}
    />
  );
}
