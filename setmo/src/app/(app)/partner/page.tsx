import { requireRole } from "@/lib/auth";
import { getViewerPartner, getPartnerDashboard } from "@/lib/partner-portal";
import { StatTile } from "@/components/ui/StatTile";
import { CopyLink, PayoutToggle } from "@/components/partner/PartnerWidgets";

const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const STATUS: Record<string, { label: string; cls: string }> = { active: { label: "Active", cls: "mint" }, prospect: { label: "Assessing", cls: "" }, lapsed: { label: "Lapsed", cls: "amber" } };

export default async function PartnerDashboardPage() {
  const user = await requireRole("PARTNER_ADMIN", "PARTNER_MEMBER");
  const ctx = await getViewerPartner(user);
  if (!ctx) return <div className="content"><div className="card card-pad muted">No partner account is linked to your login.</div></div>;
  const d = await getPartnerDashboard(ctx.partnerId, ctx.memberUserId);
  if (!d) return <div className="content"><div className="card card-pad muted">Partner not found.</div></div>;

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{d.partner.name}</h1>
          <p>{d.isDistribution ? "Distribution partner" : "Referral partner"}{d.isAdmin ? "" : " · your referrals"} · paid automatically on the 1st &amp; 15th</p>
        </div>
      </div>

      <div className="content">
        <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
          <StatTile lab="Earned (unpaid)" val={usd(d.earnings.earnedCents)} grad="var(--grad-mint)" sub="next payout" />
          <StatTile lab="Pending" val={usd(d.earnings.pendingCents)} sub="until account's 2nd payment" />
          <StatTile lab="Paid to date" val={usd(d.earnings.paidCents)} sub="lifetime" />
          <StatTile lab="Accounts" val={String(d.accounts.length)} sub={`${d.accounts.filter((a) => a.status === "active").length} active`} />
        </div>

        {d.link && (
          <div className="card card-pad rise" style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Your referral link</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Share it — practices that sign up or take a free assessment through it are credited to you (first-touch).</p>
            <CopyLink link={d.link} />
          </div>
        )}

        <div className="grid g-2" style={{ marginBottom: 18 }}>
          <div className="card card-pad rise">
            <h3 style={{ fontSize: 18, marginBottom: 10 }}>{d.isDistribution ? "Your accounts" : "Referred accounts"}</h3>
            {d.accounts.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No referrals yet — share your link to get started.</p>}
            {d.accounts.map((a, i) => {
              const st = STATUS[a.status];
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                    {d.isDistribution && a.balanceMin != null && (
                      <div className="muted" style={{ fontSize: 12, color: a.low ? "var(--amber)" : undefined }}>{a.balanceMin.toLocaleString()} min left{a.low ? " · low" : ""}</div>
                    )}
                  </div>
                  <span className={"chip " + st.cls} style={{ padding: "2px 9px", fontSize: 11 }}>{st.label}</span>
                  <span className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 800, fontSize: 14, width: 60, textAlign: "right" }}>{usd(a.earnedCents)}</span>
                </div>
              );
            })}
            {d.isDistribution && <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>View-only — you don&apos;t take actions on customer accounts.</p>}
          </div>

          {d.isAdmin && (
            <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
              <h3 style={{ fontSize: 18, marginBottom: 4 }}>Payout method</h3>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Cash is the default. Credit earns +5% and applies to your linked SetMo practice.</p>
              <PayoutToggle method={d.partner.payoutMethod} hasPractice={d.partner.hasPractice} />
              <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>Commissions are paid automatically on the 1st and 15th once an account clears its 2nd payment. Cash payouts require a W-9 (we&apos;ll request it before your first payout).</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
