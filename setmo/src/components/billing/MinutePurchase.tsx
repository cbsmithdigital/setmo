"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { tokenQuote, recommendTokens, tokensToMinutes, TOKEN_STEP, minTokens, maxTokens, DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

const SALES_EMAIL = "hello@growdental.ai,adam@growdental.ai";

// Drag-slider token purchase. 1 min of live AI = 10 tokens. In activate mode the
// admin also picks monthly vs annual prepay (2 months free + a bigger token discount).
// A live sign-up promo makes activation access-only by default (the bonus tokens
// are the starter balance) with starter tokens as an optional add-on.
export function MinutePurchase({
  defaultPeople = 1,
  cfg = DEFAULT_PRICING,
  mode = "topup",
  accessMonthly = 44.95,
  annualAccess = 449.5,
  discountPct = 0,
  monthlyDiscountPct = 0,
  annualDiscountPct = 0,
  promo = null,
}: {
  defaultPeople?: number;
  cfg?: PricingConfig;
  mode?: "topup" | "activate";
  accessMonthly?: number;
  annualAccess?: number;
  discountPct?: number; // topup: the account's current token discount
  monthlyDiscountPct?: number; // activate: token discount if they pick monthly
  annualDiscountPct?: number; // activate: token discount if they pick annual
  promo?: { monthlyTokens: number; annualTokens: number; endsAt: string } | null; // activate: sign-up bonus offer
}) {
  const isActivate = mode === "activate";
  const hasPromo = isActivate && !!promo;
  const [people, setPeople] = useState(String(defaultPeople));
  const recommended = useMemo(() => recommendTokens(Number(people) || 1, cfg), [people, cfg]);
  const [tokens, setTokens] = useState(recommended);
  const [plan, setPlan] = useState<"monthly" | "annual">("monthly");
  const [withTokens, setWithTokens] = useState(!hasPromo); // promo: start access-only
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const MIN_T = minTokens(cfg);
  const MAX_T = maxTokens(cfg);
  const effDiscount = isActivate ? (plan === "annual" ? annualDiscountPct : monthlyDiscountPct) : discountPct;
  const quote = tokenQuote(tokens, cfg, effDiscount);
  const bonusTokens = hasPromo ? (plan === "annual" ? promo!.annualTokens : promo!.monthlyTokens) : 0;
  const bonusHours = Math.round(bonusTokens / 600); // 600 tokens ≈ 1 hour of live AI
  // Access-only checkout only exists while the SELECTED plan carries a bonus —
  // without one there'd be no starting balance (and the server 422s minutes: 0).
  const buyingTokens = !isActivate || withTokens || bonusTokens === 0;
  const accessCharge = plan === "annual" ? annualAccess : accessMonthly;
  const todayTotal = (buyingTokens ? quote.total : 0) + (isActivate ? accessCharge : 0);

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
        body: JSON.stringify({ minutes: buyingTokens ? tokensToMinutes(quote.tokens) : 0, ...(isActivate ? { plan } : {}) }),
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
          ? hasPromo
            ? "Go live today: activate Practice Access and practice on your free sign-up tokens. Tokens power every practice & coaching call (10 tokens ≈ 1 min of live AI), roll over, and never expire."
            : "Go live today: Practice Access plus your starter tokens, in one payment. Tokens power every practice & coaching call (10 tokens ≈ 1 min of live AI), roll over, and never expire."
          : "Tokens power every practice & coaching call (10 tokens ≈ 1 minute of live AI). They roll over and never expire. Bigger balances earn a better rate."}
      </p>

      {/* sign-up promo (activation only) — list only plans that carry a bonus */}
      {hasPromo && (
        <div className="banner mint" style={{ marginBottom: 16, fontSize: 13 }}>
          <b>Sign-up offer:</b> activate by <b>{promo!.endsAt}</b> and get{" "}
          {promo!.monthlyTokens > 0 && (
            <>
              <b>{promo!.monthlyTokens.toLocaleString()} free tokens</b> ({Math.round(promo!.monthlyTokens / 600)} hours) on monthly
              {promo!.annualTokens > 0 ? " — or " : "."}
            </>
          )}
          {promo!.annualTokens > 0 && (
            <>
              <b>{promo!.annualTokens.toLocaleString()}{promo!.monthlyTokens > 0 ? "" : " free tokens"}</b> ({Math.round(promo!.annualTokens / 600)} hours) on annual.
            </>
          )}
        </div>
      )}

      {/* plan toggle (activation only) */}
      {isActivate && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={"btn " + (plan === "monthly" ? "btn-primary" : "btn-ghost")} style={{ flex: 1, padding: "9px 10px", fontSize: 13 }} onClick={() => setPlan("monthly")}>
              Monthly · ${accessMonthly.toFixed(2)}/mo
            </button>
            <button type="button" className={"btn " + (plan === "annual" ? "btn-primary" : "btn-ghost")} style={{ flex: 1, padding: "9px 10px", fontSize: 13 }} onClick={() => setPlan("annual")}>
              Annual · 2 months free
            </button>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
            {plan === "annual"
              ? `$${annualAccess.toLocaleString()}/year (2 months free) + ${annualDiscountPct}% off all tokens.`
              : `$${accessMonthly.toFixed(2)}/month + ${monthlyDiscountPct}% off all tokens.`} Early-adopter pricing through Aug 1.
          </p>
        </div>
      )}

      {/* starter tokens opt-in (promo activation starts access-only) — only when
          the selected plan actually carries a bonus to practice on */}
      {hasPromo && bonusTokens > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={withTokens} onChange={(e) => setWithTokens(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--purple)" }} />
          Also buy starter tokens today{effDiscount > 0 ? ` (${effDiscount}% off)` : ""}
          <span className="muted" style={{ fontWeight: 400 }}>— optional, your free hours come either way</span>
        </label>
      )}

      {buyingTokens && (<>
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
      </>)}

      {isActivate && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, padding: "12px 0", borderTop: "1px solid var(--line-soft)", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Practice Access ({plan === "annual" ? "first year" : "first month"})</span><b>${accessCharge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
          {buyingTokens && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">{quote.tokens.toLocaleString()} starter tokens{effDiscount > 0 ? ` (${effDiscount}% off)` : ""}</span><b>${quote.total.toLocaleString()}</b></div>
          )}
          {bonusTokens > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">{bonusTokens.toLocaleString()} bonus tokens ({bonusHours} free hours) — sign-up offer</span><b className="mint-text">Free</b></div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5, marginTop: 4 }}><span style={{ fontWeight: 700 }}>Due today</span><b className="mint-text" style={{ fontFamily: "var(--font-lato)" }}>${todayTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
          <div className="muted" style={{ fontSize: 11.5 }}>Then {plan === "annual" ? `$${annualAccess.toLocaleString()}/year` : `$${accessMonthly.toFixed(2)}/month`} for access. Buy more tokens anytime ({effDiscount}% off). Plus tax where applicable.</div>
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
