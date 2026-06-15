"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { ModalShell } from "@/components/Modal";
import { TIERS, planTotal, type PlanTier, type Cadence } from "@/lib/pricing";

const MAX = 20;
const DEMO_MAILTO = "mailto:hello@growdental.ai?subject=SetMo%20for%20our%20group";

export function SubscribeModal({
  currentTier,
  currentSeats,
  currentCadence,
  foundersOpen,
  onClose,
}: {
  currentTier: PlanTier | null;
  currentSeats: number;
  currentCadence: Cadence;
  foundersOpen: boolean;
  onClose: () => void;
}) {
  const [tier, setTier] = useState<PlanTier>(currentTier ?? "TEAM");
  const [cadence, setCadence] = useState<Cadence>(currentCadence);
  const [seats, setSeats] = useState(Math.max(1, currentTier === "PRACTICE" ? 2 : currentSeats));
  const [extra, setExtra] = useState(currentTier === "PRACTICE" ? Math.max(0, currentSeats - 2) : 0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const founder = foundersOpen;
  const cfg = { tier, cadence, founder, seats, extraSetters: extra };
  const total = planTotal(cfg);
  const setterSeats = tier === "PRACTICE" ? 2 + extra : seats;

  async function go() {
    if (tier === "GROUP") {
      window.location.href = DEMO_MAILTO;
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/office/subscription/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier, cadence, seats, extraSetters: extra }),
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

  const tierMeta: { key: PlanTier; name: string; blurb: string }[] = [
    { key: "TEAM", name: "Team", blurb: "Per setter seat" },
    { key: "PRACTICE", name: "Practice", blurb: "Location + manager" },
    { key: "GROUP", name: "Group / DSO", blurb: "Custom" },
  ];

  return (
    <ModalShell onClose={onClose} width={560}>
      <div className="card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <h2 style={{ fontSize: 22 }}>Choose your plan</h2>
          <button onClick={onClose} style={{ color: "var(--muted)" }} aria-label="Close"><Icon name="x" size={20} /></button>
        </div>
        <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
          Quarterly or annual (annual saves ~10%). Each setter seat includes 5 hrs/mo, pooled across the team.
          {founder && <b style={{ color: "var(--mint)" }}> Founders pricing applied.</b>}
        </p>

        {err && <div className="banner error" style={{ marginBottom: 16 }}>{err}</div>}

        {/* tier picker */}
        <div className="field">
          <label>Plan</label>
          <div className="grid g-3" style={{ gap: 8 }}>
            {tierMeta.map((t) => (
              <button
                key={t.key}
                onClick={() => setTier(t.key)}
                className="card"
                style={{ padding: "12px 10px", textAlign: "left", borderColor: tier === t.key ? "var(--purple)" : "var(--line)", boxShadow: tier === t.key ? "0 0 0 1px var(--purple)" : "none" }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{t.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        {tier === "GROUP" ? (
          <div className="banner mint" style={{ margin: "8px 0 18px" }}>
            Group / DSO is custom, sales-led pricing — <b>talk to us</b> and we&apos;ll map the rollout across your locations.
          </div>
        ) : (
          <>
            {/* seats */}
            <div className="field">
              <label>{tier === "TEAM" ? "Setter seats" : "Additional setter seats (beyond the 2 included)"}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {tier === "TEAM" ? (
                  <>
                    <button className="btn btn-ghost" style={{ padding: "10px 16px" }} onClick={() => setSeats((s) => Math.max(1, s - 1))}>−</button>
                    <input className="input" type="number" min={1} max={MAX} value={seats} onChange={(e) => setSeats(Math.max(1, Math.min(MAX, parseInt(e.target.value || "1", 10))))} style={{ width: 90, textAlign: "center" }} />
                    <button className="btn btn-ghost" style={{ padding: "10px 16px" }} onClick={() => setSeats((s) => Math.min(MAX, s + 1))}>+</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-ghost" style={{ padding: "10px 16px" }} onClick={() => setExtra((s) => Math.max(0, s - 1))}>−</button>
                    <input className="input" type="number" min={0} max={MAX} value={extra} onChange={(e) => setExtra(Math.max(0, Math.min(MAX, parseInt(e.target.value || "0", 10))))} style={{ width: 90, textAlign: "center" }} />
                    <button className="btn btn-ghost" style={{ padding: "10px 16px" }} onClick={() => setExtra((s) => Math.min(MAX, s + 1))}>+</button>
                  </>
                )}
                <span className="muted" style={{ fontSize: 13 }}>{setterSeats * 5} hrs / mo · {setterSeats} setter seat{setterSeats === 1 ? "" : "s"}</span>
              </div>
            </div>

            {/* cadence */}
            <div className="field">
              <label>Billing cadence</label>
              <div style={{ display: "flex", gap: 6, background: "var(--s1)", border: "1px solid var(--line)", borderRadius: 99, padding: 5, width: "fit-content" }}>
                {(["QUARTERLY", "ANNUAL"] as const).map((c) => (
                  <button key={c} onClick={() => setCadence(c)} className={"btn " + (cadence === c ? "btn-primary" : "")} style={{ padding: "7px 18px", fontSize: 13.5, color: cadence === c ? "#fff" : "var(--muted)", textTransform: "capitalize" }}>
                    {c.toLowerCase()}{c === "ANNUAL" ? " (−10%)" : ""}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderTop: "1px solid var(--line)", margin: "8px 0 18px" }}>
              <span className="muted" style={{ fontSize: 14 }}>{TIERS[tier].name} · / {cadence === "ANNUAL" ? "year" : "quarter"}</span>
              <span style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 26 }} className="grad-text">${total.toLocaleString()}</span>
            </div>
          </>
        )}

        <button className="btn btn-primary btn-block btn-lg" onClick={go} disabled={loading}>
          <Icon name="card" size={18} /> {tier === "GROUP" ? "Talk to us" : loading ? "Redirecting…" : "Continue to Stripe"}
        </button>
      </div>
    </ModalShell>
  );
}
