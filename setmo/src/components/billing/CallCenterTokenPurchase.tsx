"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { tokenQuote, tokensToMinutes, TOKEN_STEP, minTokens, maxTokens, DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

const SALES_EMAIL = "hello@growdental.ai,adam@growdental.ai";

// Senior-manager top-up for the pooled call-center practice balance.
export function CallCenterTokenPurchase({ cfg = DEFAULT_PRICING }: { cfg?: PricingConfig }) {
  const MIN_T = minTokens(cfg);
  const MAX_T = maxTokens(cfg);
  const [tokens, setTokens] = useState(MIN_T);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const quote = tokenQuote(tokens, cfg, 0);

  async function buy() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/callcenter/tokens/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ minutes: tokensToMinutes(quote.tokens) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.url) { setErr(j.error ?? "Couldn't start checkout"); return; }
      window.location.href = j.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad rise">
      <h3 style={{ fontSize: 18, marginBottom: 4 }}>Buy pool tokens</h3>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
        Tokens power every agent&apos;s practice call (10 tokens ≈ 1 minute), shared across all your pods, agents, and offices. They roll over and never expire — bigger balances earn a better rate.
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 44, lineHeight: 1 }} className="grad-text">{quote.tokens.toLocaleString()}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>tokens · ≈ {quote.minutes.toLocaleString()} min</div>
        </div>
        <div style={{ paddingBottom: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-lato)" }}>${quote.total.toLocaleString()}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>${quote.perToken.toFixed(3)}/token{quote.volumeDiscountPct > 0 ? ` · ${quote.volumeDiscountPct}% volume` : ""}</div>
        </div>
      </div>
      <input type="range" min={MIN_T} max={MAX_T} step={TOKEN_STEP} value={quote.tokens} onChange={(e) => setTokens(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--purple)" }} aria-label="Tokens to buy" />
      <div style={{ position: "relative", height: 16, marginTop: 2, marginBottom: 16 }}>
        <span className="muted" style={{ position: "absolute", left: 0, fontSize: 11 }}>{MIN_T.toLocaleString()}</span>
        <span className="muted" style={{ position: "absolute", right: 0, fontSize: 11 }}>{MAX_T.toLocaleString()}</span>
      </div>
      <button className="btn btn-primary" onClick={buy} disabled={busy} style={{ padding: "11px 22px" }}>
        <Icon name="card" size={16} /> {busy ? "Starting checkout…" : `Buy ${quote.tokens.toLocaleString()} tokens — $${quote.total.toLocaleString()}`}
      </button>
      {err && <p style={{ color: "var(--amber)", fontSize: 13, marginTop: 10 }}>{err}</p>}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Large call center or more than {MAX_T.toLocaleString()} tokens?{" "}
        <a href={`mailto:${SALES_EMAIL}?subject=SetMo call-center tokens`} style={{ color: "var(--purple)" }}>Contact us for volume pricing</a>. Plus tax where applicable.
      </p>
    </div>
  );
}
