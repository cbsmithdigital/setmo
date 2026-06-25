"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { tokenQuote, recommendTokens, tokensToMinutes, TOKEN_STEP, minTokens, maxTokens, DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

const SALES_EMAIL = "hello@growdental.ai,adam@growdental.ai";

// Drag-slider token purchase. 1 min of live AI = 10 tokens. The recommendation
// comes from how many people are on the phones; price + discount update live.
export function MinutePurchase({
  defaultPeople = 1,
  cfg = DEFAULT_PRICING,
  mode = "topup",
  accessMonthly = 44.95,
  discountPct = 0,
}: {
  defaultPeople?: number;
  cfg?: PricingConfig;
  mode?: "topup" | "activate";
  accessMonthly?: number;
  discountPct?: number; // account token discount (annual 15 / monthly 8)
}) {
  const isActivate = mode === "activate";
  const [people, setPeople] = useState(String(defaultPeople));
  const recommended = useMemo(() => recommendTokens(Number(people) || 1, cfg), [people, cfg]);
  const [tokens, setTokens] = useState(recommended);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const MIN_T = minTokens(cfg);
  const MAX_T = maxTokens(cfg);
  const quote = tokenQuote(tokens, cfg, discountPct);
  const todayTotal = quote.total + (isActivate ? accessMonthly : 0);

  function applyRecommended() {
    setTokens(recommendTokens(Number(people) || 1, cfg));
  }

  async function buy() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(isActivate ? "/api/office/activate/checkout" : "/api/office/minutes/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minutes: tokensToMinutes(quote.tokens) }),
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
      <h3 style={{ fontSize: 18, marginBottom: 4 }}>{isActivate ? "Practice Access & tokens" : "Buy tokens"}</h3>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
        {isActivate
          ? `Go live today: $${accessMonthly.toFixed(2)} Practice Access plus your starter tokens, in one payment. Tokens power every practice & coaching call, roll over, and never expire — pick how many to start with.`
          : "Tokens power every practice & coaching call (10 tokens ≈ 1 minute of live AI). They roll over and never expire. Bigger balances earn a better rate."}
      </p>

      {/* recommendation input */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>People on the phones</span>
          <input className="input" inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} style={{ width: 90 }} />
        </label>
        <button className="btn btn-ghost" onClick={applyRecommended} style={{ padding: "9px 14px", fontSize: 13 }}>
          Use recommended ({recommended.toLocaleString()} tokens)
        </button>
      </div>

      {/* live quote */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 44, lineHeight: 1 }} className="grad-text">{quote.tokens.toLocaleString()}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>tokens · ≈ {quote.minutes.toLocaleString()} min · ~{quote.calls} calls</div>
        </div>
        <div style={{ paddingBottom: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-lato)" }}>${quote.total.toLocaleString()}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>${quote.perToken.toFixed(3)}/token{quote.volumeDiscountPct > 0 ? ` · ${quote.volumeDiscountPct}% volume` : ""}</div>
        </div>
        {quote.accountDiscountPct > 0 && (
          <span className="chip mint" style={{ padding: "3px 10px", marginBottom: 10 }}>{quote.accountDiscountPct}% off applied</span>
        )}
      </div>

      {/* slider */}
      <input
        type="range"
        min={MIN_T}
        max={MAX_T}
        step={TOKEN_STEP}
        value={quote.tokens}
        onChange={(e) => setTokens(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--purple)" }}
        aria-label="Tokens to buy"
      />
      <div style={{ position: "relative", height: 16, marginTop: 2, marginBottom: 16 }}>
        <span className="muted" style={{ position: "absolute", left: 0, fontSize: 11 }}>{MIN_T.toLocaleString()}</span>
        <span
          style={{ position: "absolute", left: `calc(${((recommended - MIN_T) / (MAX_T - MIN_T)) * 100}% - 18px)`, fontSize: 10.5, color: "var(--mint)", fontWeight: 700 }}
        >
          ▲ rec.
        </span>
        <span className="muted" style={{ position: "absolute", right: 0, fontSize: 11 }}>{MAX_T.toLocaleString()}</span>
      </div>

      {isActivate && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, padding: "12px 0", borderTop: "1px solid var(--line-soft)", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Practice Access (first month)</span><b>${accessMonthly.toFixed(2)}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">{quote.tokens.toLocaleString()} starter tokens</span><b>${quote.total.toLocaleString()}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5, marginTop: 4 }}><span style={{ fontWeight: 700 }}>Due today</span><b className="mint-text" style={{ fontFamily: "var(--font-lato)" }}>${todayTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
          <div className="muted" style={{ fontSize: 11.5 }}>Then ${accessMonthly.toFixed(2)}/month for access. Buy more tokens anytime. Plus tax where applicable.</div>
        </div>
      )}

      <button className="btn btn-primary" onClick={buy} disabled={busy} style={{ padding: "11px 22px" }}>
        <Icon name="card" size={16} />{" "}
        {busy
          ? "Starting checkout…"
          : isActivate
            ? `Activate — $${todayTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} today`
            : `Buy ${quote.tokens.toLocaleString()} tokens — $${quote.total.toLocaleString()}`}
      </button>
      {err && <p style={{ color: "var(--amber)", fontSize: 13, marginTop: 10 }}>{err}</p>}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Buying for a large group or more than {MAX_T.toLocaleString()} tokens?{" "}
        <a href={`mailto:${SALES_EMAIL}?subject=SetMo bulk tokens`} style={{ color: "var(--purple)" }}>Contact us for bulk pricing</a>.
      </p>
    </div>
  );
}
