"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(body: object) {
  const res = await fetch("/api/platform/partners", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, ...j } as { ok: boolean; error?: string; report?: { seededSessions: number; liveMinutesCleared: number; offices: { name: string; balanceMin: number }[] } };
}

/** Build or reset the partner's demo account. */
export function DemoResetButton({ partnerId, hasDemo }: { partnerId: string; hasDemo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (hasDemo && !window.confirm("Reset the demo account? Every call made in it — including the partner's own test calls — is cleared and fresh history is seeded, dated from today. Minutes already used stay used.")) return;
    setBusy(true);
    setMsg(null);
    const r = await post({ action: "demo", partnerId });
    setBusy(false);
    if (!r.ok || !r.report) { setMsg(r.error ?? "Couldn't build the demo account."); return; }
    const bal = r.report.offices.map((o) => `${o.name}: ${o.balanceMin} min`).join(" · ");
    setMsg(`${hasDemo ? "Reset" : "Built"} — ${r.report.seededSessions} calls seeded${r.report.liveMinutesCleared ? `, ${r.report.liveMinutesCleared} live demo min cleared` : ""}. ${bal}`);
    router.refresh();
  }

  return (
    <div>
      <button className={"btn " + (hasDemo ? "btn-ghost" : "btn-primary")} onClick={run} disabled={busy} style={{ padding: "8px 14px", fontSize: 13 }}>
        {busy ? "Working… (about a minute)" : hasDemo ? "Reset demo" : "Create demo account"}
      </button>
      {msg && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

/** Tracking-only ↔ commissions. */
export function CommissionsToggle({ partnerId, enabled }: { partnerId: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function flip() {
    const next = !enabled;
    if (!window.confirm(next ? "Turn on commissions? This partner will start earning on referred practices' payments and see earnings and payout setup." : "Set this partner to tracking-only? Referrals stay tracked; no commission accrues and payout screens are hidden.")) return;
    setBusy(true);
    const r = await post({ action: "commissions", partnerId, enabled: next });
    setBusy(false);
    if (!r.ok) window.alert(r.error ?? "Couldn't change that.");
    router.refresh();
  }
  return (
    <button className="btn btn-ghost" onClick={flip} disabled={busy} style={{ padding: "6px 12px", fontSize: 12.5 }}>
      {enabled ? "Set tracking-only" : "Turn on commissions"}
    </button>
  );
}
