"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { InviteModal } from "@/components/billing/InviteModal";
import { MinutePurchase } from "@/components/billing/MinutePurchase";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

type BillingData = {
  balance: { purchasedMin: number; usedMin: number; remainingMin: number };
  accessMonthly: number;
  annualAccess: number;
  subscribed: boolean;
  accessStatus: string | null;
  plan: "monthly" | "annual";
  accountDiscountPct: number;
  monthlyDiscountPct: number;
  annualDiscountPct: number;
  autoTopUp: boolean;
  topUpMinutes: number;
  nextInvoiceDate: string | null;
  invoices: { date: string; desc: string; amount: string; status: string; url: string | null }[];
  promo: { monthlyTokens: number; annualTokens: number; endsAt: string } | null;
};

const SIGNED_OUT = "Your session has ended — sign in again, then try once more.";

export function BillingClient({
  data,
  practiceName,
  accessStatus,
  minutesStatus,
  activateStatus,
  allowGroupAdmin = false,
  seatsFree,
  recommendPeople,
  pricing = DEFAULT_PRICING,
}: {
  data: BillingData;
  practiceName: string;
  accessStatus?: string;
  minutesStatus?: string;
  activateStatus?: string;
  allowGroupAdmin?: boolean;
  seatsFree: number;
  recommendPeople: number;
  pricing?: PricingConfig;
}) {
  const router = useRouter();
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accessErr, setAccessErr] = useState<string | null>(null);
  const [autoTopUp, setAutoTopUp] = useState(data.autoTopUp);
  const [autoBusy, setAutoBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [arrivedPurchasedMin] = useState(data.balance.purchasedMin); // tokens bought before this visit

  // Back from a Stripe checkout, the webhook can land several seconds after the
  // customer does. Until what they paid for shows, re-read the page every few
  // seconds; give up after ~30s.
  //  - Activation (?activate=success, or ?access=success for an access-only one):
  //    a finishing state stands in for the Activate button until access shows.
  //  - Switch to annual (?access=annual): the Switch button holds until the plan
  //    reads annual, so nobody pays for a second year.
  //  - Activation or a token purchase (?minutes=success): quietly, until the new
  //    tokens show. Counted from the balance on arrival, so an office that had
  //    tokens before (one reactivating, say) still waits for these.
  const activated = activateStatus === "success" || accessStatus === "success";
  const toAnnual = accessStatus === "annual";
  const finishing = (activated || toAnnual) && !data.subscribed;
  const switching = toAnnual && data.subscribed && data.plan === "monthly";
  const tokensPending = (activated || minutesStatus === "success") && data.balance.purchasedMin <= arrivedPurchasedMin;
  const awaiting = finishing || switching || tokensPending;
  useEffect(() => {
    if (!awaiting) return;
    const poll = setInterval(() => {
      // Offline, a refresh turns into a full page load (and the offline screen).
      if (navigator.onLine) router.refresh();
    }, 2500);
    const stop = setTimeout(() => {
      clearInterval(poll);
      setSlow(true);
    }, 30_000);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [awaiting, router]);

  // Once it has all shown (or the quiet wait for tokens gave up), take the
  // ?…=success off the address, so a later reload of this tab starts fresh
  // instead of waiting again. Only the address changes; the page on screen,
  // banner included, stays as it is. Deferred a tick: on the first render this
  // effect runs before Next's router has hooked window.history, and Next must
  // see the change to keep Back working.
  const backFromCheckout = activated || toAnnual || minutesStatus === "success";
  const settled = !finishing && !switching && (!tokensPending || slow);
  useEffect(() => {
    if (!backFromCheckout || !settled) return;
    const tidy = setTimeout(() => window.history.replaceState(null, "", window.location.pathname), 0);
    return () => clearTimeout(tidy);
  }, [backFromCheckout, settled]);

  // Back from Stripe without a reload (the back/forward cache, or an in-app
  // browser sheet closing on a phone): the buttons work again.
  useEffect(() => {
    const ready = () => {
      if (document.visibilityState === "visible") setBusy(false);
    };
    window.addEventListener("pageshow", ready);
    document.addEventListener("visibilitychange", ready);
    return () => {
      window.removeEventListener("pageshow", ready);
      document.removeEventListener("visibilitychange", ready);
    };
  }, []);

  async function toggleAutoTopUp(next: boolean) {
    setAutoTopUp(next);
    setAutoBusy(true);
    try {
      const res = await fetch("/api/office/auto-topup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: next }) });
      if (!res.ok) setAutoTopUp(!next); // revert on failure
    } catch {
      setAutoTopUp(!next);
    } finally {
      setAutoBusy(false);
    }
  }

  const { purchasedMin, usedMin, remainingMin } = data.balance;
  const pct = purchasedMin > 0 ? Math.min(100, (usedMin / purchasedMin) * 100) : 0;
  const low = purchasedMin > 0 && remainingMin <= purchasedMin * 0.2;
  const tok = (m: number) => m * 10; // 1 min = 10 SetMo Tokens

  // Both go to a Stripe page; on a refusal, say why under the buttons.
  async function manageAccess() {
    setBusy(true);
    setAccessErr(null);
    try {
      const res = await fetch("/api/office/billing-portal", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url;
        return;
      }
      setAccessErr(res.status === 401 ? SIGNED_OUT : j.error ?? "Couldn't open the billing portal. Try again in a minute, or email hello@growdental.ai.");
    } catch {
      setAccessErr("Couldn't reach SetMo — check your connection and try again.");
    }
    setBusy(false);
  }

  async function switchToAnnual() {
    setBusy(true);
    setAccessErr(null);
    try {
      const res = await fetch("/api/office/subscription/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "annual" }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url;
        return;
      }
      if (res.status === 409) router.refresh(); // already annual (another tab, say): catch the card up
      setAccessErr(res.status === 401 ? SIGNED_OUT : j.error ?? "Couldn't start the switch to annual. Try again in a minute, or email hello@growdental.ai.");
    } catch {
      setAccessErr("Couldn't reach SetMo — check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Usage &amp; billing</h1>
          <p>Practice access, your token balance, and invoices for {practiceName}.</p>
        </div>
        <div className="tb-right">
          <button className="btn btn-primary" onClick={() => setInvite(true)}>
            <Icon name="team" size={17} /> Invite users
          </button>
        </div>
      </div>

      <div className="content">
        {activateStatus === "success" && data.subscribed && <div className="banner mint" style={{ marginBottom: 18 }}>You&apos;re live! Practice Access is active and your starter tokens are being added — give it a few seconds.</div>}
        {activateStatus === "cancel" && <div className="banner error" style={{ marginBottom: 18 }}>Activation cancelled — no charge was made.</div>}
        {accessStatus === "success" && data.subscribed && <div className="banner mint" style={{ marginBottom: 18 }}>Practice Access is active — thanks! Any sign-up bonus tokens land in your balance within a few seconds.</div>}
        {switching && <div className="banner mint" style={{ marginBottom: 18 }}>Thanks! Moving you to the annual plan — this page updates by itself in a few seconds.</div>}
        {toAnnual && data.subscribed && data.plan === "annual" && <div className="banner mint" style={{ marginBottom: 18 }}>You&apos;re on the annual plan now — thanks!</div>}
        {accessStatus === "cancel" && <div className="banner error" style={{ marginBottom: 18 }}>Checkout cancelled — no charge was made.</div>}
        {minutesStatus === "success" && <div className="banner mint" style={{ marginBottom: 18 }}>Payment received — your tokens will be added within a few seconds.</div>}
        {minutesStatus === "cancel" && <div className="banner error" style={{ marginBottom: 18 }}>Checkout cancelled — no charge was made.</div>}

        {/* Once subscribed: access status + minute balance. Before that, the
            combined activation section below carries the access + minutes info. */}
        {data.subscribed && (
          <div className="grid g-2" style={{ marginBottom: 18 }}>
            {/* access */}
            <div className="card card-pad rise">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: 18 }}>Practice Access</h3>
                <span className="chip mint" style={{ padding: "3px 10px" }}>Active · {data.plan === "annual" ? "Annual" : "Monthly"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 40 }} className="grad-text">${(data.plan === "annual" ? data.annualAccess : data.accessMonthly).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="muted" style={{ fontSize: 14, paddingBottom: 6 }}>/ {data.plan === "annual" ? "year" : "month"}</span>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Per location. Unlimited users, all features included. {data.accountDiscountPct > 0 ? `${data.accountDiscountPct}% off all token purchases.` : ""}
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                <span className="muted">Next invoice</span>
                <b>{data.nextInvoiceDate ?? "—"}</b>
              </div>
              {data.plan === "monthly" && (
                <button className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} onClick={switchToAnnual} disabled={busy || switching}>
                  <Icon name="spark" size={16} /> {switching ? "Switching you to annual…" : `Switch to annual — 2 months free + ${data.annualDiscountPct}% off tokens`}
                </button>
              )}
              <button className="btn btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={manageAccess} disabled={busy}>
                <Icon name="card" size={16} /> Manage access
              </button>
              {switching && slow && (
                <p style={{ color: "var(--amber)", fontSize: 13, marginTop: 10 }}>
                  This is taking longer than usual — refresh in a minute, or email{" "}
                  <a href="mailto:hello@growdental.ai?subject=SetMo%20annual%20plan" style={{ color: "var(--purple)" }}>hello@growdental.ai</a>.
                </p>
              )}
              {accessErr && <p role="alert" style={{ color: "var(--amber)", fontSize: 13, marginTop: 10 }}>{accessErr}</p>}
            </div>

            {/* token balance */}
            <div className="card card-pad rise" style={{ animationDelay: ".06s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: 18 }}>Token balance</h3>
                <span className={"chip " + (low ? "amber" : "mint")} style={{ padding: "3px 10px" }}>{low ? "Running low" : "Healthy"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 8 }}>
                <span className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 48, lineHeight: 1 }}>{tok(remainingMin).toLocaleString()}</span>
                <span className="muted" style={{ fontSize: 15, fontWeight: 600, paddingBottom: 8 }}>tokens left</span>
              </div>
              <div style={{ height: 10, borderRadius: 99, background: "#181828", overflow: "hidden", margin: "6px 0 8px" }}>
                <div style={{ height: "100%", width: pct + "%", background: low ? "linear-gradient(90deg,#f59e0b,#ef4444)" : "var(--grad-mint)", borderRadius: 99 }} />
              </div>
              <p className="muted" style={{ fontSize: 12.5 }}>
                {tok(usedMin).toLocaleString()} of {tok(purchasedMin).toLocaleString()} tokens used (≈ {remainingMin.toLocaleString()} min left). Tokens roll over — assessments are always free and never deducted.
              </p>

              {/* auto top-up */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-soft)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>Auto top-up</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {data.topUpMinutes > 0
                      ? <>Auto-buys <b>{tok(data.topUpMinutes).toLocaleString()} tokens</b> (your last purchase) when the balance dips below 250.</>
                      : <>Buy tokens once, then auto top-up can re-buy that amount automatically.</>}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoTopUp}
                  disabled={autoBusy || data.topUpMinutes === 0}
                  onClick={() => toggleAutoTopUp(!autoTopUp)}
                  title={data.topUpMinutes === 0 ? "Buy tokens first to enable auto top-up" : undefined}
                  style={{ flex: "none", width: 46, height: 26, borderRadius: 99, padding: 3, background: autoTopUp ? "var(--grad-mint)" : "#2a2a40", border: "none", cursor: data.topUpMinutes === 0 ? "not-allowed" : "pointer", opacity: data.topUpMinutes === 0 ? 0.5 : 1, transition: "background .2s" }}
                >
                  <span style={{ display: "block", width: 20, height: 20, borderRadius: "50%", background: "#fff", transform: autoTopUp ? "translateX(20px)" : "translateX(0)", transition: "transform .2s" }} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* buy tokens (slider) — combined activation when not yet subscribed; just
            back from paying for that, a finishing state instead of a second Activate */}
        <div id="activate-card" style={{ marginBottom: 24 }}>
          {finishing ? (
            <div className="card card-pad rise" role="status">
              <h3 style={{ fontSize: 18, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
                {!slow && <span className="live-dot" />}Finishing your activation…
              </h3>
              <p className="muted" style={{ fontSize: 13.5 }}>
                Thanks! We&apos;re switching on Practice Access and adding your tokens. It usually takes a few seconds, and this page updates by itself.
              </p>
              {slow && (
                <p style={{ color: "var(--amber)", fontSize: 13, marginTop: 10 }}>
                  This is taking longer than usual — refresh in a minute, or email{" "}
                  <a href="mailto:hello@growdental.ai?subject=SetMo%20activation" style={{ color: "var(--purple)" }}>hello@growdental.ai</a>.
                </p>
              )}
            </div>
          ) : (
            <MinutePurchase
              defaultPeople={recommendPeople}
              cfg={pricing}
              mode={data.subscribed ? "topup" : "activate"}
              accessMonthly={data.accessMonthly}
              annualAccess={data.annualAccess}
              discountPct={data.accountDiscountPct}
              monthlyDiscountPct={data.monthlyDiscountPct}
              annualDiscountPct={data.annualDiscountPct}
              promo={data.promo}
            />
          )}
        </div>

        {/* invoices */}
        <div className="eyebrow" style={{ marginBottom: 12 }}>Invoices</div>
        <div className="card rise" style={{ overflowX: "auto" }}>
          {data.invoices.length === 0 ? (
            <div className="card-pad muted" style={{ fontSize: 13.5 }}>No invoices yet. Access charges and token receipts will appear here once billing is live.</div>
          ) : (
            <div style={{ minWidth: 520 }}>
              {data.invoices.map((inv, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 90px", gap: 16, alignItems: "center", padding: "14px 22px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{inv.date}</div>
                  <div className="muted" style={{ fontSize: 13.5 }}>{inv.desc}</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{inv.amount}</div>
                  <div><span className="chip mint" style={{ padding: "3px 11px", fontSize: 12 }}>{inv.status}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {invite && <InviteModal seatsFree={seatsFree} allowGroupAdmin={allowGroupAdmin} onClose={() => setInvite(false)} />}
    </>
  );
}
