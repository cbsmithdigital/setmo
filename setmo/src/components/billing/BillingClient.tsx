"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { BundleModal } from "@/components/billing/BundleModal";
import { InviteModal } from "@/components/billing/InviteModal";
import { SubscribeModal } from "@/components/billing/SubscribeModal";

type BillingData = {
  allowance: { poolUsed: number; poolTotal: number };
  subscribed: boolean;
  seats: number;
  filled: number;
  cadence: "MONTHLY" | "QUARTERLY";
  pricePerSeat: number;
  discountLabel: string;
  monthlyTotal: number;
  quarterlyTotal: number;
  nextInvoiceDate: string | null;
  bundles: { hours: number; priceUsd: number; popular?: boolean }[];
  invoices: { date: string; desc: string; amount: string; status: string; url: string | null }[];
};

export function BillingClient({
  data,
  practiceName,
  bundleStatus,
  subStatus,
}: {
  data: BillingData;
  practiceName: string;
  bundleStatus?: string;
  subStatus?: string;
}) {
  const [modal, setModal] = useState<null | "bundle" | "invite" | "subscribe">(null);
  const [cadence, setCadence] = useState<"MONTHLY" | "QUARTERLY">(data.cadence);

  const { poolUsed, poolTotal } = data.allowance;
  const poolPct = poolTotal > 0 ? Math.round((poolUsed / poolTotal) * 100) : 0;
  const remain = Math.max(0, poolTotal - poolUsed);
  const low = poolPct > 80;
  const total = cadence === "QUARTERLY" ? data.quarterlyTotal : data.monthlyTotal;
  const seatsFree = Math.max(0, data.seats - data.filled);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Usage &amp; billing</h1>
          <p>Seats, your practice pool, bundles, and invoices for {practiceName}.</p>
        </div>
        <div className="tb-right">
          <button className="btn btn-primary" onClick={() => setModal("invite")}>
            <Icon name="team" size={17} /> Invite setters
          </button>
        </div>
      </div>

      <div className="content">
        {bundleStatus === "success" && (
          <div className="banner mint" style={{ marginBottom: 18 }}>
            Payment received — your bundle will be added to the pool within a few seconds.
          </div>
        )}
        {bundleStatus === "cancel" && (
          <div className="banner error" style={{ marginBottom: 18 }}>
            Checkout cancelled — no charge was made.
          </div>
        )}
        {subStatus === "success" && (
          <div className="banner mint" style={{ marginBottom: 18 }}>
            Subscription confirmed — your seats and pool will update within a few seconds.
          </div>
        )}
        {subStatus === "cancel" && (
          <div className="banner error" style={{ marginBottom: 18 }}>
            Checkout cancelled — no plan changes were made.
          </div>
        )}

        {/* pool + plan */}
        <div className="grid g-2" style={{ marginBottom: 18 }}>
          <div className="card card-pad rise">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 18 }}>Practice pool</h3>
              <span className={"chip " + (low ? "amber" : "mint")} style={{ padding: "3px 10px" }}>
                {low ? "Running low" : "Healthy"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 8 }}>
              <span className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 48, lineHeight: 1 }}>
                {remain.toFixed(1)}
              </span>
              <span className="muted" style={{ fontSize: 15, fontWeight: 600, paddingBottom: 8 }}>
                of {poolTotal.toFixed(0)} hrs left
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 99, background: "#181828", overflow: "hidden", margin: "6px 0 8px" }}>
              <div style={{ height: "100%", width: poolPct + "%", background: low ? "linear-gradient(90deg,#f59e0b,#ef4444)" : "var(--grad-mint)", borderRadius: 99 }} />
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
              {data.seats} seats × 3 hrs = {data.seats * 3} hrs included, plus purchased bundles. No surprise overage —
              sessions pause when the pool runs out.
            </p>
            <button className="btn btn-primary" onClick={() => setModal("bundle")}>
              <Icon name="card" size={16} /> Buy a conversation bundle
            </button>
          </div>

          <div className="card card-pad rise" style={{ animationDelay: ".06s" }}>
            <h3 style={{ fontSize: 18, marginBottom: 14 }}>Plan</h3>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 40 }} className="grad-text">
                ${total.toFixed(0)}
              </span>
              <span className="muted" style={{ fontSize: 14, paddingBottom: 6 }}>
                / {cadence === "QUARTERLY" ? "quarter" : "month"}
              </span>
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              {data.seats} seats · ${data.pricePerSeat}/seat · {data.discountLabel}
              {cadence === "QUARTERLY" ? " · extra 5% quarterly" : ""}
            </p>
            <div style={{ display: "flex", gap: 6, background: "var(--s1)", border: "1px solid var(--line)", borderRadius: 99, padding: 5, marginBottom: 16, width: "fit-content" }}>
              {(["MONTHLY", "QUARTERLY"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCadence(c)}
                  className={"btn " + (cadence === c ? "btn-primary" : "")}
                  style={{ padding: "7px 18px", fontSize: 13.5, color: cadence === c ? "#fff" : "var(--muted)", textTransform: "capitalize" }}
                >
                  {c.toLowerCase()}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
              <span className="muted">Seats filled</span>
              <b>{data.filled} / {data.seats}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
              <span className="muted">Next invoice</span>
              <b>{data.nextInvoiceDate ?? "—"}</b>
            </div>
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: 14 }} onClick={() => setModal("subscribe")}>
              <Icon name="card" size={16} /> {data.subscribed ? "Manage plan & seats" : "Subscribe"}
            </button>
          </div>
        </div>

        {/* bundles */}
        <div className="eyebrow" style={{ marginBottom: 12 }}>Top up with a conversation bundle</div>
        <div className="grid g-3 rise" style={{ marginBottom: 24, animationDelay: ".1s" }}>
          {data.bundles.map((bd) => (
            <button
              key={bd.hours}
              onClick={() => setModal("bundle")}
              className="card card-pad"
              style={{
                textAlign: "left",
                borderColor: bd.popular ? "var(--purple)" : "var(--line)",
                boxShadow: bd.popular ? "0 0 0 1px var(--purple)" : "var(--shadow-card)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 30 }}>
                  +{bd.hours}
                  <span style={{ fontSize: 16 }}>hrs</span>
                </span>
                {bd.popular && (
                  <span className="chip purple" style={{ padding: "3px 10px" }}>
                    Popular
                  </span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
                ≈ {bd.hours} more hours of practice across your team.
              </div>
              <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 22 }} className="mint-text">
                ${bd.priceUsd}
              </div>
            </button>
          ))}
        </div>

        {/* invoices */}
        <div className="eyebrow" style={{ marginBottom: 12 }}>Invoices</div>
        <div className="card rise" style={{ overflowX: "auto", animationDelay: ".15s" }}>
          {data.invoices.length === 0 ? (
            <div className="card-pad muted" style={{ fontSize: 13.5 }}>
              No invoices yet. Seat charges and bundle receipts will appear here once billing is live.
            </div>
          ) : (
            <div style={{ minWidth: 520 }}>
              {data.invoices.map((inv, i) => (
                <div
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 90px", gap: 16, alignItems: "center", padding: "14px 22px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{inv.date}</div>
                  <div className="muted" style={{ fontSize: 13.5 }}>{inv.desc}</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{inv.amount}</div>
                  <div>
                    <span className="chip mint" style={{ padding: "3px 11px", fontSize: 12 }}>{inv.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modal === "bundle" && <BundleModal bundles={data.bundles} onClose={() => setModal(null)} />}
      {modal === "invite" && <InviteModal seatsFree={seatsFree} onClose={() => setModal(null)} />}
      {modal === "subscribe" && (
        <SubscribeModal currentSeats={data.seats} currentCadence={data.cadence} onClose={() => setModal(null)} />
      )}
    </>
  );
}
