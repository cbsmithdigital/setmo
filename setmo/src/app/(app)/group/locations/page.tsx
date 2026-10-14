import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPlatformConfig, getPricingConfig, promoInfo } from "@/lib/config";
import { getMinuteBalance, hasSignupBonusGrant } from "@/lib/usage";
import { inDemoAccount } from "@/lib/demo-shared";
import { InviteButton } from "@/components/office/InviteButton";
import { GroupLocations, type LocationRow } from "@/components/group/GroupLocations";

// The group's locations: add one, activate it (Practice Access + starter
// tokens), top up its tokens, and invite its people — all without SetMo.
export default async function GroupLocationsPage({ searchParams }: { searchParams: Promise<{ activate?: string; access?: string; minutes?: string }> }) {
  const user = await requireRole("GROUP_ADMIN");
  if (!user.organizationId) {
    return (
      <div className="content">
        <div className="card card-pad muted">No organization is assigned to your account yet.</div>
      </div>
    );
  }
  const { activate, access, minutes } = await searchParams;
  const paid = [activate, access, minutes].includes("success");

  const [offices, cfg, pricing] = await Promise.all([
    prisma.office.findMany({
      where: { organizationId: user.organizationId },
      select: {
        id: true,
        name: true,
        city: true,
        subscription: { select: { status: true, plan: true } },
        _count: { select: { users: { where: { role: "SETTER", status: { not: "DISABLED" } } } } },
      },
      orderBy: { name: "asc" },
    }),
    getPlatformConfig(),
    getPricingConfig(),
  ]);

  const rows: LocationRow[] = await Promise.all(
    offices.map(async (o) => {
      const active = o.subscription?.status === "ACTIVE";
      const annual = o.subscription?.plan === "ANNUAL";
      const [balance, hadBonus] = await Promise.all([getMinuteBalance(o.id), active ? Promise.resolve(true) : hasSignupBonusGrant(o.id)]);
      return {
        id: o.id,
        name: o.name,
        city: o.city,
        status: o.subscription?.status ?? null,
        tokensLeft: Math.max(0, balance.remainingMin) * 10,
        setters: o._count.users,
        accountDiscountPct: active ? (annual ? cfg.annualTokenDiscountPct : cfg.monthlyTokenDiscountPct) : 0,
        promo: !active && !hadBonus ? promoInfo(cfg) : null,
      };
    })
  );

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Locations</h1>
          <p>Add a location, turn on Practice Access, and keep each one stocked with tokens.</p>
        </div>
        <div className="tb-right" style={{ display: "flex", gap: 10 }}>
          <InviteButton scope="group" offices={offices.map((o) => ({ id: o.id, name: o.name }))} className="btn btn-ghost" />
        </div>
      </div>
      <div className="content">
        {paid && (
          <div className="banner mint" style={{ marginBottom: 18 }}>
            Payment received — thanks! It can take a few seconds to show here; refresh if it hasn&apos;t yet.
          </div>
        )}
        <GroupLocations
          rows={rows}
          demo={inDemoAccount(user)}
          pricing={pricing}
          accessMonthly={cfg.accessMonthly}
          annualAccess={Math.round(cfg.accessMonthly * 10 * 100) / 100}
          monthlyDiscountPct={cfg.monthlyTokenDiscountPct}
          annualDiscountPct={cfg.annualTokenDiscountPct}
        />
      </div>
    </>
  );
}
