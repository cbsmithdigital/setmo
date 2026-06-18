"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { minuteQuote, recommendMinutes, MIN_MINUTES, MAX_MINUTES, MINUTE_STEP } from "@/lib/pricing";

const SALES_EMAIL = "hello@growdental.ai";

// Drag-slider minute purchase. The recommendation comes from how many people are
// on the phones; per-minute price + discount update live as you drag.
export function MinutePurchase({ defaultPeople = 1 }: { defaultPeople?: number }) {
  const [people, setPeople] = useState(String(defaultPeople));
  const recommended = useMemo(() => recommendMinutes(Number(people) || 1), [people]);
  const [minutes, setMinutes] = useState(recommended);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const quote = minuteQuote(minutes);
  const pct = ((quote.minutes - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES)) * 100;

  function applyRecommended() {
    setMinutes(recommendMinutes(Number(people) || 1));
  }

  async function buy() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/office/minutes/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minutes: quote.minutes }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.url) { setErr(j.error ?? "Couldn't start checkout"); return; }
      window.location.href = j.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad rise">
      <h3 style={{ fontSize: 18, marginBottom: 4 }}>Buy minutes</h3>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
        Minutes power every practice &amp; coaching call. They roll over and never expire. Bigger balances earn a better rate.
      </p>

      {/* recommendation input */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>People on the phones</span>
          <input className="input" inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} style={{ width: 90 }} />
        </label>
        <button className="btn btn-ghost" onClick={applyRecommended} style={{ padding: "9px 14px", fontSize: 13 }}>
          Use recommended ({recommended.toLocaleString()} min)
        </button>
      </div>

      {/* live quote */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 44, lineHeight: 1 }} className="grad-text">{quote.minutes.toLocaleString()}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>minutes</div>
        </div>
        <div style={{ paddingBottom: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-lato)" }}>${quote.total.toLocaleString()}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>${quote.perMin.toFixed(2)}/min{quote.discountPct > 0 ? ` · ${quote.discountPct}% off` : ""}</div>
        </div>
        {quote.discountPct > 0 && (
          <span className="chip mint" style={{ padding: "3px 10px", marginBottom: 10 }}>Save {quote.discountPct}%</span>
        )}
      </div>

      {/* slider */}
      <input
        type="range"
        min={MIN_MINUTES}
        max={MAX_MINUTES}
        step={MINUTE_STEP}
        value={quote.minutes}
        onChange={(e) => setMinutes(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--purple)" }}
        aria-label="Minutes to buy"
      />
      <div style={{ position: "relative", height: 16, marginTop: 2 }}>
        <span className="muted" style={{ position: "absolute", left: 0, fontSize: 11 }}>{MIN_MINUTES}</span>
        {/* recommended marker */}
        <span
          style={{ position: "absolute", left: `calc(${((recommended - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES)) * 100}% - 18px)`, fontSize: 10.5, color: "var(--mint)", fontWeight: 700 }}
        >
          ▲ rec.
        </span>
        <span className="muted" style={{ position: "absolute", right: 0, fontSize: 11 }}>{MAX_MINUTES.toLocaleString()}</span>
      </div>
      {/* subtle fill cue */}
      <div style={{ height: 4, borderRadius: 99, background: "#181828", overflow: "hidden", margin: "2px 0 14px" }}>
        <div style={{ height: "100%", width: pct + "%", background: "var(--grad)", borderRadius: 99 }} />
      </div>

      <button className="btn btn-primary" onClick={buy} disabled={busy} style={{ padding: "11px 22px" }}>
        <Icon name="card" size={16} /> {busy ? "Starting checkout…" : `Buy ${quote.minutes.toLocaleString()} minutes — $${quote.total.toLocaleString()}`}
      </button>
      {err && <p style={{ color: "var(--amber)", fontSize: 13, marginTop: 10 }}>{err}</p>}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Buying for a large group or more than {MAX_MINUTES.toLocaleString()} minutes?{" "}
        <a href={`mailto:${SALES_EMAIL}?subject=SetMo bulk minutes`} style={{ color: "var(--purple)" }}>Contact us for bulk pricing</a>.
      </p>
    </div>
  );
}
