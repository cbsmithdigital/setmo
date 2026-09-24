import { requireRole } from "@/lib/auth";
import { inDemoAccount } from "@/lib/demo-shared";
import { getViewerPartner, getPartnerDashboard } from "@/lib/partner-portal";
import { refreshConnectStatus, getPartnerPayouts } from "@/lib/payouts";
import { StatTile } from "@/components/ui/StatTile";
import { CopyLink, PayoutToggle, ConnectButton } from "@/components/partner/PartnerWidgets";

const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "mint" },
  signed_up: { label: "Signed up", cls: "purple" },
  prospect: { label: "Took the audit", cls: "" },
};

export default async function PartnerDashboardPage({ searchParams }: { searchParams: Promise<{ connect?: string }> }) {
  const user = await requireRole("PARTNER_ADMIN", "PARTNER_MEMBER");
  const ctx = await getViewerPartner(user);
  if (!ctx) return <div className="content"><div className="card card-pad muted">No partner account is linked to your login.</div></div>;
  const { connect } = await searchParams;
  const [d, payouts] = await Promise.all([getPartnerDashboard(ctx.partnerId, ctx.memberUserId), ctx.isAdmin ? getPartnerPayouts(ctx.partnerId) : Promise.resolve([])]);
  if (!d) return <div className="content"><div className="card card-pad muted">Partner not found.</div></div>;
  const paid = d.partner.commissionsEnabled; // false = tracking-only: referrals, no earnings
  if (paid && ctx.isAdmin && (connect === "done" || connect === "refresh")) await refreshConnectStatus(ctx.partnerId);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{d.partner.name}</h1>
          <p>
            {d.isDistribution ? "Distribution partner" : "Referral partner"}
            {d.isAdmin ? "" : " · your referrals"}
            {paid ? " · paid automatically on the 1st & 15th" : ""}
          </p>
        </div>
      </div>

      <div className="content">
        <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
          {paid ? (
            <>
              <StatTile lab="Earned (unpaid)" val={usd(d.earnings.earnedCents)} grad="var(--grad-mint)" sub="next payout" />
              <StatTile lab="Pending" val={usd(d.earnings.pendingCents)} sub="until account's 2nd payment" />
              <StatTile lab="Paid to date" val={usd(d.earnings.paidCents)} sub="lifetime" />
              <StatTile lab="Accounts" val={String(d.counts.referred)} sub={`${d.counts.active} active`} />
            </>
          ) : (
            <>
              <StatTile lab="Practices referred" val={String(d.counts.referred)} grad="var(--grad-mint)" sub="through your link" />
              <StatTile lab="Active" val={String(d.counts.active)} sub="practice access on" />
              <StatTile lab="Signed up" val={String(d.counts.signedUp)} sub="not activated yet" />
              <StatTile lab="Took the audit" val={String(d.counts.assessing)} sub="free assessment" />
            </>
          )}
        </div>

        {d.link && (
          <div className="card card-pad rise" style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>{d.isAdmin ? "Your tracking link" : "Your personal tracking link"}</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
              Send this to practices. It opens SetMo&apos;s home page; any practice that signs up or runs the free
              assessment afterwards is credited to {d.isAdmin ? d.partner.name : "you"} — even if they come back days later.
            </p>
            <CopyLink link={d.link} />
          </div>
        )}

        <div className="grid g-2" style={{ marginBottom: 18 }}>
          <div className="card card-pad rise">
            <h3 style={{ fontSize: 18, marginBottom: 10 }}>{d.isAdmin ? "Referred practices" : "Your referred practices"}</h3>
            {d.accounts.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No referrals yet — share your link to get started.</p>}
            {d.accounts.map((a, i) => {
              const st = STATUS[a.status] ?? { label: a.status, cls: "" };
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {d.isAdmin ? (a.rep ? `via ${a.rep}` : `via ${d.partner.name}`) : "via your link"}
                      {" · "}
                      {new Date(a.referredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {d.isDistribution && a.balanceMin != null && (
                        <span style={{ color: a.low ? "var(--amber)" : undefined }}> · {a.balanceMin.toLocaleString()} min left{a.low ? " (low)" : ""}</span>
                      )}
                    </div>
                  </div>
                  <span className={"chip " + st.cls} style={{ padding: "2px 9px", fontSize: 11 }}>{st.label}</span>
                  {paid && <span className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 800, fontSize: 14, width: 60, textAlign: "right" }}>{usd(a.earnedCents)}</span>}
                </div>
              );
            })}
            {d.isDistribution && <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>View-only — you don&apos;t take actions on customer accounts.</p>}
          </div>

          {d.isAdmin && paid && (
            <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
              <h3 style={{ fontSize: 18, marginBottom: 4 }}>Payout method</h3>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Cash is the default. Credit earns +5% and applies to your linked SetMo practice.</p>
              <PayoutToggle method={d.partner.payoutMethod} hasPractice={d.partner.hasPractice} />
              {d.partner.payoutMethod === "CASH" && (
                <div style={{ marginTop: 16 }}>
                  <ConnectButton onboarded={d.partner.connectOnboarded} />
                  <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Stripe handles your W-9 and 1099 during setup.</p>
                </div>
              )}
              <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>Paid automatically on the 1st and 15th once an account clears its 2nd payment.</p>

              {payouts.length > 0 && (
                <div style={{ marginTop: 16, borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Recent payouts</div>
                  {payouts.map((p) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                      <span className="muted">{new Date(p.createdAt).toLocaleDateString()} · {p.method.toLowerCase()}{p.status !== "PAID" ? ` · ${p.status.toLowerCase()}` : ""}</span>
                      <b>{usd(p.amountCents)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {d.isAdmin && !paid && d.members.length > 0 && (
            <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
              <h3 style={{ fontSize: 18, marginBottom: 10 }}>By rep</h3>
              {d.members.map((m, i) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>
                    {m.name || m.email}
                    {m.status !== "ACTIVE" && <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}> · {m.status.toLowerCase()}</span>}
                  </div>
                  <span className="muted" style={{ fontSize: 13 }}>{m.referred} referred</span>
                  <span className="mint-text" style={{ fontWeight: 700, fontSize: 13, width: 70, textAlign: "right" }}>{m.active} active</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {d.partner.hasDemo && inDemoAccount(user) && (
          <p className="muted" style={{ fontSize: 12.5 }}>
            To show SetMo to a practice, switch to a role marked &quot;Demo&quot; with the role switcher in the sidebar.
          </p>
        )}
      </div>
    </>
  );
}
