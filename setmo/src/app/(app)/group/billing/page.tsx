import { requireRole } from "@/lib/auth";
import { getOrgCoachBalance } from "@/lib/usage";
import { getPlatformConfig, getPricingConfig } from "@/lib/config";
import { GroupTokenPurchase } from "@/components/billing/GroupTokenPurchase";

export default async function GroupBillingPage() {
  const user = await requireRole("GROUP_ADMIN");
  if (!user.organizationId) {
    return (
      <>
        <div className="topbar"><div className="tb-greet"><h1>Billing</h1></div></div>
        <div className="content"><div className="card card-pad"><p className="muted">No group is assigned to your account.</p></div></div>
      </>
    );
  }

  const [balance, cfg, pricing] = await Promise.all([
    getOrgCoachBalance(user.organizationId),
    getPlatformConfig(),
    getPricingConfig(),
  ]);

  const tk = (min: number) => (min * 10).toLocaleString();
  const resets = balance.periodResetsOn.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const low = balance.remainingMin <= 15;

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Billing</h1>
          <p>Your Setty Advisor voice wallet — {balance.freePerMonth} free min/month, then {cfg.groupTokenDiscountPct}% off tokens.</p>
        </div>
        <div className="tb-right">
          <span className="chip purple">Setty Advisor</span>
        </div>
      </div>

      <div className="content">
        {low && (
          <div className="banner" style={{ background: "rgba(251,191,36,.12)", borderColor: "rgba(251,191,36,.4)", color: "#fcd34d", marginBottom: 18 }}>
            You have {tk(balance.remainingMin)} tokens (~{balance.remainingMin} min) left. Add a card and top up below to keep your strategy sessions going — your free allowance refreshes {resets}.
          </div>
        )}

        <div className="grid g-3 rise" style={{ gap: 16, marginBottom: 18 }}>
          <div className="card card-pad">
            <div className="eyebrow">This month — free</div>
            <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 34, lineHeight: 1.1 }} className="grad-text">{tk(balance.freeRemaining)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>tokens left of {tk(balance.freePerMonth)} · ~{balance.freeRemaining}/{balance.freePerMonth} min · resets {resets}</div>
          </div>
          <div className="card card-pad">
            <div className="eyebrow">Purchased (rolls over)</div>
            <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 34, lineHeight: 1.1 }}>{tk(balance.purchasedRemaining)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>tokens · ~{balance.purchasedRemaining} min · never expire</div>
          </div>
          <div className="card card-pad">
            <div className="eyebrow">Total available</div>
            <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 34, lineHeight: 1.1 }}>{tk(balance.remainingMin)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>tokens · ~{balance.remainingMin} min of voice strategy</div>
          </div>
        </div>

        <GroupTokenPurchase cfg={pricing} discountPct={cfg.groupTokenDiscountPct} />
      </div>
    </>
  );
}
