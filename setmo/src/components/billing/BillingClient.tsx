"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { InviteModal } from "@/components/billing/InviteModal";
import { MinutePurchase } from "@/components/billing/MinutePurchase";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

type BillingData = {
  balance: { purchasedMin: number; usedMin: number; remainingMin: number };
  accessMonthly: number;
  subscribed: boolean;
  accessStatus: string | null;
  nextInvoiceDate: string | null;
  invoices: { date: string; desc: string; amount: string; status: string; url: string | null }[];
};

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
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState(false);

  const { purchasedMin, usedMin, remainingMin } = data.balance;
  const pct = purchasedMin > 0 ? Math.min(100, (usedMin / purchasedMin) * 100) : 0;
  const low = purchasedMin > 0 && remainingMin <= purchasedMin * 0.2;

  async function manageAccess() {
    setBusy(true);
    try {
      const res = await fetch("/api/office/subscription/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await res.json().catch(() => ({}));
      if (j.url) window.location.href = j.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Usage &amp; billing</h1>
          <p>Practice access, your minute balance, and invoices for {practiceName}.</p>
        </div>
        <div className="tb-right">
          <button className="btn btn-primary" onClick={() => setInvite(true)}>
            <Icon name="team" size={17} /> Invite users
          </button>
        </div>
      </div>

      <div className="content">
        {activateStatus === "success" && <div className="banner mint" style={{ marginBottom: 18 }}>You&apos;re live! Practice Access is active and your starter minutes are being added — give it a few seconds.</div>}
        {activateStatus === "cancel" && <div className="banner error" style={{ marginBottom: 18 }}>Activation cancelled — no charge was made.</div>}
        {accessStatus === "success" && <div className="banner mint" style={{ marginBottom: 18 }}>Practice Access is active — thanks! Manage it anytime here.</div>}
        {accessStatus === "cancel" && <div className="banner error" style={{ marginBottom: 18 }}>Checkout cancelled — no charge was made.</div>}
        {minutesStatus === "success" && <div className="banner mint" style={{ marginBottom: 18 }}>Payment received — your minutes will be added within a few seconds.</div>}
        {minutesStatus === "cancel" && <div className="banner error" style={{ marginBottom: 18 }}>Checkout cancelled — no charge was made.</div>}

        {/* Once subscribed: access status + minute balance. Before that, the
            combined activation section below carries the access + minutes info. */}
        {data.subscribed && (
          <div className="grid g-2" style={{ marginBottom: 18 }}>
            {/* access */}
            <div className="card card-pad rise">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: 18 }}>Practice Access</h3>
                <span className="chip mint" style={{ padding: "3px 10px" }}>Active</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 40 }} className="grad-text">${data.accessMonthly.toFixed(2)}</span>
                <span className="muted" style={{ fontSize: 14, paddingBottom: 6 }}>/ month</span>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Per location, month-to-month. Unlimited users, all features included. No contract.
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                <span className="muted">Next invoice</span>
                <b>{data.nextInvoiceDate ?? "—"}</b>
              </div>
              <button className="btn btn-ghost" style={{ width: "100%", marginTop: 14 }} onClick={manageAccess} disabled={busy}>
                <Icon name="card" size={16} /> Manage access
              </button>
            </div>

            {/* minute balance */}
            <div className="card card-pad rise" style={{ animationDelay: ".06s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: 18 }}>Minute balance</h3>
                <span className={"chip " + (low ? "amber" : "mint")} style={{ padding: "3px 10px" }}>{low ? "Running low" : "Healthy"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 8 }}>
                <span className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 48, lineHeight: 1 }}>{remainingMin.toLocaleString()}</span>
                <span className="muted" style={{ fontSize: 15, fontWeight: 600, paddingBottom: 8 }}>min left</span>
              </div>
              <div style={{ height: 10, borderRadius: 99, background: "#181828", overflow: "hidden", margin: "6px 0 8px" }}>
                <div style={{ height: "100%", width: pct + "%", background: low ? "linear-gradient(90deg,#f59e0b,#ef4444)" : "var(--grad-mint)", borderRadius: 99 }} />
              </div>
              <p className="muted" style={{ fontSize: 12.5 }}>
                {usedMin.toLocaleString()} of {purchasedMin.toLocaleString()} purchased minutes used. Minutes roll over — assessments are always free and never deducted.
              </p>
            </div>
          </div>
        )}

        {/* buy minutes (slider) — combined activation when not yet subscribed */}
        <div id="activate-card" style={{ marginBottom: 24 }}>
          <MinutePurchase defaultPeople={recommendPeople} cfg={pricing} mode={data.subscribed ? "topup" : "activate"} accessMonthly={data.accessMonthly} />
        </div>

        {/* invoices */}
        <div className="eyebrow" style={{ marginBottom: 12 }}>Invoices</div>
        <div className="card rise" style={{ overflowX: "auto" }}>
          {data.invoices.length === 0 ? (
            <div className="card-pad muted" style={{ fontSize: 13.5 }}>No invoices yet. Access charges and minute receipts will appear here once billing is live.</div>
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
