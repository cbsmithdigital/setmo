"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { tokenQuote, tokensToMinutes, TOKEN_STEP, minTokens, maxTokens, DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

const SALES_EMAIL = "hello@growdental.ai,adam@growdental.ai";

// Group/DSO token top-up for the Setty Advisor voice wallet. Sold at `discountPct`
// off list (50% for group/DSO). Buying also puts a card on file for next time.
export function GroupTokenPurchase({
  cfg = DEFAULT_PRICING,
  discountPct = 50,
}: {
  cfg?: PricingConfig;
  discountPct?: number;
}) {
  const MIN_T = minTokens(cfg);
  const MAX_T = maxTokens(cfg);
  const [tokens, setTokens] = useState(MIN_T);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const quote = tokenQuote(tokens, cfg, discountPct);

  async function buy() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/group/tokens/checkout", {
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
      <h3 style={{ fontSize: 18, marginBottom: 4 }}>Buy Setty Advisor tokens</h3>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
        Tokens power your Setty Advisor voice sessions (10 tokens ≈ 1 minute). They roll over and never expire — and as a group/DSO you get <b>{discountPct}% off</b> our normal pricing. Checkout saves a card so your next top-up is one click.
      </p>

      {/* live quote */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 44, lineHeight: 1 }} className="grad-text">{quote.tokens.toLocaleString()}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>tokens · ≈ {quote.minutes.toLocaleString()} min</div>
        </div>
        <div style={{ paddingBottom: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-lato)" }}>${quote.total.toLocaleString()}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            ${quote.perToken.toFixed(3)}/token{quote.listTotal > quote.total ? <> · <s>${quote.listTotal.toLocaleString()}</s></> : null}
          </div>
        </div>
        {discountPct > 0 && <span className="chip mint" style={{ padding: "3px 10px", marginBottom: 10 }}>{discountPct}% group discount</span>}
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
        <span className="muted" style={{ position: "absolute", right: 0, fontSize: 11 }}>{MAX_T.toLocaleString()}</span>
      </div>

      <button className="btn btn-primary" onClick={buy} disabled={busy} style={{ padding: "11px 22px" }}>
        <Icon name="card" size={16} /> {busy ? "Starting checkout…" : `Buy ${quote.tokens.toLocaleString()} tokens — $${quote.total.toLocaleString()}`}
      </button>
      {err && <p style={{ color: "var(--amber)", fontSize: 13, marginTop: 10 }}>{err}</p>}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Need more than {MAX_T.toLocaleString()} tokens?{" "}
        <a href={`mailto:${SALES_EMAIL}?subject=SetMo group tokens`} style={{ color: "var(--purple)" }}>Contact us</a>. Plus tax where applicable.
      </p>
    </div>
  );
}
