"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ModalShell } from "@/components/Modal";

type Bundle = { hours: number; priceUsd: number; popular?: boolean };

export function BundleModal({ bundles, onClose }: { bundles: Bundle[]; onClose: () => void }) {
  const [sel, setSel] = useState(bundles.find((b) => b.popular)?.hours ?? bundles[0]?.hours ?? 10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chosen = bundles.find((b) => b.hours === sel)!;

  async function pay() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/office/bundles/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hours: sel }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setErr(data.error ?? "Couldn't start checkout.");
        setLoading(false);
        return;
      }
      window.location.href = data.url; // redirect to Stripe Checkout
    } catch {
      setErr("Couldn't start checkout. Try again.");
      setLoading(false);
    }
  }

  return (
    <ModalShell onClose={onClose} width={540}>
      <div className="card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <h2 style={{ fontSize: 22 }}>Buy a conversation bundle</h2>
          <button onClick={onClose} style={{ color: "var(--muted)" }} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>
        <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
          Prepaid hours that stack on your included pool. One-time charge, no subscription change.
        </p>

        {err && <div className="banner error" style={{ marginBottom: 16 }}>{err}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {bundles.map((b) => {
            const active = sel === b.hours;
            return (
              <button
                key={b.hours}
                onClick={() => setSel(b.hours)}
                style={{
                  padding: "15px 18px",
                  borderRadius: 12,
                  textAlign: "left",
                  border: "1px solid " + (active ? "var(--purple)" : "var(--line)"),
                  background: active ? "rgba(139,92,246,.1)" : "var(--s1)",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  transition: "all .2s",
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "2px solid " + (active ? "var(--purple)" : "var(--faint)"),
                    display: "grid",
                    placeItems: "center",
                    flex: "none",
                  }}
                >
                  {active && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--purple)" }} />}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    +{b.hours} hours
                    {b.popular && (
                      <span className="chip purple" style={{ padding: "1px 8px", fontSize: 10.5, marginLeft: 6 }}>
                        Popular
                      </span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    ≈ ${(b.priceUsd / b.hours).toFixed(0)}/hr of team practice
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 20 }} className="mint-text">
                  ${b.priceUsd}
                </div>
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 0",
            borderTop: "1px solid var(--line)",
            marginBottom: 18,
          }}
        >
          <span className="muted" style={{ fontSize: 14 }}>Total today</span>
          <span style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 24 }}>${chosen.priceUsd}.00</span>
        </div>

        <button className="btn btn-primary btn-block btn-lg" onClick={pay} disabled={loading}>
          <Icon name="card" size={18} /> {loading ? "Redirecting…" : `Pay $${chosen.priceUsd} with Stripe`}
        </button>
        <p className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 12 }}>
          Secured by Stripe · adds {chosen.hours} hrs to your pool once payment clears
        </p>
      </div>
    </ModalShell>
  );
}
