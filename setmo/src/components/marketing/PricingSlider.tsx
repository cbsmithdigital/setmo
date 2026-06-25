"use client";

import { useMemo, useState } from "react";
import { tokenQuote, recommendTokens, TOKEN_STEP, minTokens, maxTokens, DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

// Marketing price-preview slider (light theme). Illustrative only — the real
// purchase happens in-app after signup. Mirrors the in-app token pricing math.
export function PricingSlider({ cfg = DEFAULT_PRICING }: { cfg?: PricingConfig }) {
  const [people, setPeople] = useState("3");
  const recommended = useMemo(() => recommendTokens(Number(people) || 1, cfg), [people, cfg]);
  const [tokens, setTokens] = useState(recommended);
  const quote = tokenQuote(tokens, cfg);
  const MIN_T = minTokens(cfg);
  const MAX_T = maxTokens(cfg);
  const recPct = ((recommended - MIN_T) / (MAX_T - MIN_T)) * 100;

  return (
    <div style={{ background: "var(--purple-soft)", border: "1px solid var(--m-line)", borderRadius: 16, padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>Add tokens — pay as you go</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--m-muted)" }}>
          People on the phones
          <input
            inputMode="numeric"
            value={people}
            onChange={(e) => { setPeople(e.target.value); setTokens(recommendTokens(Number(e.target.value) || 1, cfg)); }}
            style={{ width: 54, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--m-line)", background: "#fff", color: "var(--ink)", fontSize: 14, textAlign: "center" }}
          />
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-lato), system-ui", fontWeight: 900, fontSize: 38, lineHeight: 1, color: "var(--ink)" }}>{quote.tokens.toLocaleString()}<span style={{ fontSize: 16, color: "var(--m-muted)", fontWeight: 700 }}> tokens</span></div>
          <div style={{ fontSize: 12, color: "var(--m-muted)", marginTop: 2 }}>≈ {quote.minutes.toLocaleString()} min · ~{quote.calls} calls</div>
        </div>
        <div style={{ paddingBottom: 2 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)" }}>${quote.total.toLocaleString()}</div>
          <div style={{ fontSize: 12.5, color: "var(--m-muted)" }}>${quote.perToken.toFixed(3)}/token</div>
        </div>
        {quote.volumeDiscountPct > 0 && (
          <span style={{ marginBottom: 4, fontSize: 12, fontWeight: 800, color: "var(--purple-deep)", background: "#fff", border: "1px solid var(--m-line)", borderRadius: 999, padding: "3px 10px" }}>Save {quote.volumeDiscountPct}%</span>
        )}
      </div>

      <input
        type="range"
        min={MIN_T}
        max={MAX_T}
        step={TOKEN_STEP}
        value={quote.tokens}
        onChange={(e) => setTokens(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--purple)" }}
        aria-label="Tokens to purchase"
      />
      <div style={{ position: "relative", height: 16, marginTop: 2, fontSize: 11, color: "var(--m-muted)" }}>
        <span style={{ position: "absolute", left: 0 }}>{MIN_T.toLocaleString()}</span>
        <span style={{ position: "absolute", left: `calc(${recPct}% - 16px)`, color: "var(--m-mint)", fontWeight: 800 }}>▲ rec.</span>
        <span style={{ position: "absolute", right: 0 }}>{MAX_T.toLocaleString()}</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--m-muted)", margin: "10px 0 0" }}>
        Tokens roll over and never expire (10 tokens ≈ 1 minute of live AI). Bigger balances earn a better rate. Need more than {MAX_T.toLocaleString()}?{" "}
        <a href="mailto:hello@growdental.ai,adam@growdental.ai?subject=SetMo%20bulk%20tokens" style={{ color: "var(--purple-deep)", fontWeight: 600 }}>Contact us for bulk pricing</a>.
      </p>
    </div>
  );
}
