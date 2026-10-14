"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { MinutePurchase } from "@/components/billing/MinutePurchase";
import type { PricingConfig } from "@/lib/pricing";
import type { PromoInfo } from "@/lib/config";

export type LocationRow = {
  id: string;
  name: string;
  city: string | null;
  status: string | null; // subscription status, null = never activated
  tokensLeft: number;
  setters: number;
  accountDiscountPct: number;
  promo: PromoInfo | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Access on", cls: "mint" },
  PAST_DUE: { label: "Payment due", cls: "amber" },
  CANCELED: { label: "Inactive", cls: "" },
};

export function GroupLocations({
  rows,
  demo,
  pricing,
  accessMonthly,
  annualAccess,
  monthlyDiscountPct,
  annualDiscountPct,
}: {
  rows: LocationRow[];
  demo: boolean;
  pricing: PricingConfig;
  accessMonthly: number;
  annualAccess: number;
  monthlyDiscountPct: number;
  annualDiscountPct: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null); // the location whose purchase panel is open
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addLocation(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/group/locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), city: city.trim() || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Couldn't add the location."); return; }
      setName("");
      setCity("");
      setAdding(false);
      setOpen(j.office?.id ?? null); // straight to activating it
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {err && <div className="banner error" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="card card-pad rise" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <h3 style={{ fontSize: 18 }}>Your locations ({rows.length})</h3>
          {!demo && (
            <button className="btn btn-primary" onClick={() => setAdding((a) => !a)} style={{ padding: "8px 16px" }}>
              <Icon name="building" size={15} /> {adding ? "Close" : "Add a location"}
            </button>
          )}
        </div>

        {adding && (
          <form onSubmit={addLocation} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: "12px 0 16px", borderBottom: "1px solid var(--line-soft)", marginBottom: 6 }}>
            <div style={{ flex: "2 1 220px" }}>
              <label className="muted" style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 5 }}>Location name</label>
              <input className="input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bright Smile — Eastside" style={{ width: "100%" }} />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label className="muted" style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 5 }}>City (optional)</label>
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Denver" style={{ width: "100%" }} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy || name.trim().length < 2} style={{ padding: "10px 18px" }}>
              {busy ? "Adding…" : "Add location"}
            </button>
          </form>
        )}

        {rows.map((r, i) => {
          const active = r.status === "ACTIVE";
          const st = r.status ? STATUS[r.status] ?? STATUS.CANCELED : { label: "Not activated", cls: "amber" };
          const isOpen = open === r.id;
          return (
            <div key={r.id} style={{ borderTop: i || adding ? "1px solid var(--line-soft)" : "none", padding: "12px 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <Link href={`/group/office/${r.id}`} style={{ fontWeight: 600, fontSize: 14.5 }}>{r.name}</Link>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.city ? `${r.city} · ` : ""}{r.setters} setter{r.setters === 1 ? "" : "s"} · {r.tokensLeft.toLocaleString()} tokens left
                  </div>
                </div>
                <span className={"chip " + st.cls} style={{ padding: "2px 9px", fontSize: 11 }}>{st.label}</span>
                {!demo && (
                  <button className={"btn " + (active ? "btn-ghost" : "btn-primary")} onClick={() => setOpen(isOpen ? null : r.id)} style={{ padding: "6px 14px", fontSize: 13 }}>
                    {isOpen ? "Close" : active ? "Add tokens" : "Activate"}
                  </button>
                )}
              </div>
              {isOpen && (
                <div style={{ marginTop: 12 }}>
                  <MinutePurchase
                    defaultPeople={Math.max(1, r.setters)}
                    cfg={pricing}
                    mode={active ? "topup" : "activate"}
                    accessMonthly={accessMonthly}
                    annualAccess={annualAccess}
                    discountPct={r.accountDiscountPct}
                    monthlyDiscountPct={monthlyDiscountPct}
                    annualDiscountPct={annualDiscountPct}
                    promo={r.promo}
                    endpoint={`/api/group/locations/${r.id}/${active ? "tokens" : "activate"}`}
                  />
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No locations yet — add your first one.</p>}
      </div>

      <p className="muted" style={{ fontSize: 12.5 }}>
        Each location is ${accessMonthly.toFixed(2)}/month for Practice Access (unlimited users), plus tokens for practice calls. Invite each location&apos;s setters and office admin with <b>Invite users</b> above — pick the location as you invite.
      </p>
    </>
  );
}
