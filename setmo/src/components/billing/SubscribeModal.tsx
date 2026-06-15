"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ModalShell } from "@/components/Modal";

const PRICE_PER_SEAT = 59.99;
const MAX_SEATS = 20;

function discountRate(seats: number) {
  if (seats >= 15 && seats <= 20) return 0.15;
  if (seats >= 10 && seats <= 14) return 0.1;
  return 0;
}

export function SubscribeModal({
  currentSeats,
  currentCadence,
  onClose,
}: {
  currentSeats: number;
  currentCadence: "MONTHLY" | "QUARTERLY";
  onClose: () => void;
}) {
  const [seats, setSeats] = useState(Math.max(1, currentSeats));
  const [cadence, setCadence] = useState<"MONTHLY" | "QUARTERLY">(currentCadence);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const over = seats > MAX_SEATS;
  const rate = discountRate(seats);
  const monthly = seats * PRICE_PER_SEAT * (1 - rate);
  const total = cadence === "QUARTERLY" ? monthly * 3 * 0.95 : monthly;
  const includedHours = seats * 5;

  async function go() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/office/subscription/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seats, cadence }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setErr(data.error ?? "Couldn't start checkout.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setErr("Couldn't start checkout. Try again.");
      setLoading(false);
    }
  }

  return (
    <ModalShell onClose={onClose} width={520}>
      <div className="card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <h2 style={{ fontSize: 22 }}>Choose your plan</h2>
          <button onClick={onClose} style={{ color: "var(--muted)" }} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>
        <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
          $59.99 / seat / month. Each seat includes 3 hours of practice that pool across your team.
          Volume discounts kick in at 10 and 15 seats.
        </p>

        {err && <div className="banner error" style={{ marginBottom: 16 }}>{err}</div>}

        {/* seat stepper */}
        <div className="field">
          <label>Seats</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn btn-ghost" style={{ padding: "10px 16px" }} onClick={() => setSeats((s) => Math.max(1, s - 1))}>
              −
            </button>
            <input
              className="input"
              type="number"
              min={1}
              value={seats}
              onChange={(e) => setSeats(Math.max(1, parseInt(e.target.value || "1", 10)))}
              style={{ width: 90, textAlign: "center" }}
            />
            <button className="btn btn-ghost" style={{ padding: "10px 16px" }} onClick={() => setSeats((s) => s + 1)}>
              +
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              {includedHours} hrs / mo included{rate > 0 ? ` · ${Math.round(rate * 100)}% off` : ""}
            </span>
          </div>
        </div>

        {/* cadence */}
        <div className="field">
          <label>Billing cadence</label>
          <div style={{ display: "flex", gap: 6, background: "var(--s1)", border: "1px solid var(--line)", borderRadius: 99, padding: 5, width: "fit-content" }}>
            {(["MONTHLY", "QUARTERLY"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCadence(c)}
                className={"btn " + (cadence === c ? "btn-primary" : "")}
                style={{ padding: "7px 18px", fontSize: 13.5, color: cadence === c ? "#fff" : "var(--muted)", textTransform: "capitalize" }}
              >
                {c.toLowerCase()}
                {c === "QUARTERLY" ? " (−5%)" : ""}
              </button>
            ))}
          </div>
        </div>

        {over ? (
          <div className="banner mint" style={{ margin: "8px 0 18px" }}>
            Over 20 seats is custom DSO pricing — <b>contact us</b> and we&apos;ll set you up.
          </div>
        ) : (
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderTop: "1px solid var(--line)", margin: "8px 0 18px" }}
          >
            <span className="muted" style={{ fontSize: 14 }}>
              Total / {cadence === "QUARTERLY" ? "quarter" : "month"}
            </span>
            <span style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 26 }} className="grad-text">
              ${total.toFixed(0)}
            </span>
          </div>
        )}

        <button className="btn btn-primary btn-block btn-lg" onClick={go} disabled={loading || over}>
          <Icon name="card" size={18} /> {loading ? "Redirecting…" : "Continue to Stripe"}
        </button>
      </div>
    </ModalShell>
  );
}
