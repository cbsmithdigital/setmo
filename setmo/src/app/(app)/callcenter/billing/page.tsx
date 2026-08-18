import { requireRole, getActiveRole } from "@/lib/auth";
import { getCallCenterBalance } from "@/lib/usage";
import { getPricingConfig } from "@/lib/config";
import { StatTile } from "@/components/ui/StatTile";
import { CallCenterTokenPurchase } from "@/components/billing/CallCenterTokenPurchase";

export default async function CallCenterBillingPage() {
  const user = await requireRole("CALL_CENTER_ADMIN", "CALL_CENTER_MANAGER");
  const senior = getActiveRole(user) === "CALL_CENTER_ADMIN";
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <>
        <div className="topbar"><div className="tb-greet"><h1>Billing</h1></div></div>
        <div className="content"><div className="card card-pad"><p className="muted">No call center linked to your account.</p></div></div>
      </>
    );
  }
  const [balance, pricing] = await Promise.all([getCallCenterBalance(orgId), getPricingConfig()]);
  const tk = (min: number) => (min * 10).toLocaleString();

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Billing</h1>
          <p>Your pooled practice balance — shared across every agent, pod, and served office.</p>
        </div>
      </div>

      <div className="content">
        <div className="grid g-3 rise" style={{ marginBottom: 18 }}>
          <StatTile lab="Tokens remaining" val={tk(balance.remainingMin)} grad="var(--grad-mint)" sub={`~${balance.remainingMin.toLocaleString()} min of practice`} />
          <StatTile lab="Purchased" val={tk(balance.purchasedMin)} sub="lifetime · rolls over" />
          <StatTile lab="Used" val={tk(balance.usedMin)} sub="across all agents" />
        </div>

        {senior ? (
          <CallCenterTokenPurchase cfg={pricing} />
        ) : (
          <div className="card card-pad"><p className="muted" style={{ fontSize: 14 }}>Your senior manager funds the shared pool. Ping them if the balance is running low.</p></div>
        )}
      </div>
    </>
  );
}
