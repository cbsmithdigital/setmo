import { requireRole } from "@/lib/auth";
import { getOfficeBilling } from "@/lib/queries";
import { getPricingConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { BillingClient } from "@/components/billing/BillingClient";
import { getMinuteBalance } from "@/lib/usage";
import { inDemoAccount, DEMO_BILLING_MESSAGE } from "@/lib/demo-shared";

export default async function OfficeBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string; minutes?: string; activate?: string }>;
}) {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const { access, minutes, activate } = await searchParams;

  // A demo account has nothing to buy: show the balance, not a checkout.
  if (inDemoAccount(user)) {
    const balance = await getMinuteBalance(user.officeId!);
    return (
      <>
        <div className="topbar">
          <div className="tb-greet">
            <h1>Billing</h1>
            <p>{user.office?.name ?? "Demo practice"} · demo account</p>
          </div>
        </div>
        <div className="content">
          <div className="card card-pad" style={{ maxWidth: 560 }}>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>Practice minutes remaining</div>
            <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 32, marginBottom: 12 }}>
              {Math.max(0, balance.remainingMin).toLocaleString()} min
            </div>
            <p className="muted" style={{ fontSize: 14 }}>{DEMO_BILLING_MESSAGE}</p>
          </div>
        </div>
      </>
    );
  }
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
      allowGroupAdmin={!!user.organizationId && user.roles.some((r) => r === "GROUP_ADMIN" || r === "PLATFORM_ADMIN")}
      seatsFree={9999}
      recommendPeople={Math.max(1, activeSetters)}
      pricing={pricing}
    />
  );
}
