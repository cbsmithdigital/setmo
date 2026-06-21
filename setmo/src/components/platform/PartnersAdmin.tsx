"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PartnerRow } from "@/lib/partners";

const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function PartnersAdmin({ partners, isSuper, appUrl }: { partners: PartnerRow[]; isSuper: boolean; appUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function call(body: object, key: string) {
    setBusy(key);
    const res = await fetch("/api/platform/partners", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    router.refresh();
    setBusy(null);
    return j as { inviteLink?: string };
  }
  async function approve(partnerId: string) {
    const j = await call({ action: "approve", partnerId }, partnerId);
    if (j?.inviteLink) window.prompt("Partner approved. Email isn't configured — share this login link with the partner:", j.inviteLink);
  }

  const pending = partners.filter((p) => p.status === "PENDING");
  const active = partners.filter((p) => p.status !== "PENDING");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {pending.length > 0 && (
        <div className="card card-pad rise" style={{ background: "linear-gradient(150deg,rgba(251,191,36,.12),var(--s2))" }}>
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>Applications to review ({pending.length})</h3>
          {pending.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? "1px solid var(--line-soft)" : "none", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name} <span className="chip" style={{ padding: "2px 8px", fontSize: 11, marginLeft: 6 }}>{p.track === "REFERRAL" ? "Referral" : "Distribution"}</span></div>
                <div className="muted" style={{ fontSize: 12 }}>{p.contactName} · {p.email} · {p.orgType ?? "—"}</div>
                {p.audience && <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{p.audience}</div>}
              </div>
              <button className="btn btn-primary" disabled={busy === p.id} onClick={() => approve(p.id)} style={{ padding: "7px 14px", fontSize: 13 }}>Approve</button>
              <button className="btn btn-ghost" disabled={busy === p.id} onClick={() => call({ action: "disable", partnerId: p.id }, p.id)} style={{ padding: "7px 12px", fontSize: 13, color: "var(--muted)" }}>Reject</button>
            </div>
          ))}
        </div>
      )}

      <div className="card card-pad rise">
        <h3 style={{ fontSize: 18, marginBottom: 12 }}>Partners ({active.length})</h3>
        {active.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No approved partners yet.</p>}
        {active.map((p, i) => (
          <div key={p.id} style={{ padding: "14px 0", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}
                  <span className={"chip " + (p.status === "APPROVED" ? "mint" : "")} style={{ padding: "2px 8px", fontSize: 11, marginLeft: 8 }}>{p.status === "APPROVED" ? "Active" : "Disabled"}</span>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{p.contactName} · {p.email} · {p.track === "REFERRAL" ? "Referral" : "Distribution"} · {p.activeAccounts} active acct{p.activeAccounts === 1 ? "" : "s"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 18 }} className="mint-text">{p.rateNow}%</div>
                <div className="muted" style={{ fontSize: 11 }}>{p.payoutMethod === "CREDIT" ? "credit" : "cash"}{p.customRatePct != null ? " · custom" : ""}</div>
              </div>
            </div>

            {p.code && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Link: <code style={{ color: "var(--text-1)" }}>{appUrl}/audit?ref={p.code}</code>
              </div>
            )}

            <div style={{ display: "flex", gap: 16, fontSize: 12.5, marginTop: 8, flexWrap: "wrap" }}>
              <span className="muted">Pending <b style={{ color: "var(--text-1)" }}>{usd(p.pendingCents)}</b></span>
              <span className="muted">Earned <b className="mint-text">{usd(p.earnedCents)}</b></span>
              <span className="muted">Paid <b style={{ color: "var(--text-1)" }}>{usd(p.paidCents)}</b></span>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select className="input" value={p.track} disabled={busy === p.id} onChange={(e) => call({ action: "terms", partnerId: p.id, track: e.target.value }, p.id)} style={{ fontSize: 12, padding: "5px 8px" }}>
                <option value="REFERRAL">Referral</option>
                <option value="DISTRIBUTION">Distribution</option>
              </select>
              <select className="input" value={p.payoutMethod} disabled={busy === p.id} onChange={(e) => call({ action: "terms", partnerId: p.id, payoutMethod: e.target.value }, p.id)} style={{ fontSize: 12, padding: "5px 8px" }}>
                <option value="CASH">Cash</option>
                <option value="CREDIT">Credit (+5%)</option>
              </select>
              {isSuper && (
                <input className="input" placeholder="Custom %" defaultValue={p.customRatePct ?? ""} disabled={busy === p.id}
                  onBlur={(e) => { const v = e.target.value.trim(); call({ action: "terms", partnerId: p.id, customRatePct: v === "" ? null : Number(v) }, p.id); }}
                  style={{ width: 90, fontSize: 12, padding: "5px 8px" }} />
              )}
              {p.status === "APPROVED" ? (
                <button className="btn btn-ghost" disabled={busy === p.id} onClick={() => call({ action: "disable", partnerId: p.id }, p.id)} style={{ padding: "5px 11px", fontSize: 12, color: "var(--amber)" }}>Disable</button>
              ) : (
                <button className="btn btn-ghost" disabled={busy === p.id} onClick={() => approve(p.id)} style={{ padding: "5px 11px", fontSize: 12, color: "var(--mint)" }}>Re-approve</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
