"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/Modal";

async function post(url: string, body: object, method = "POST") {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.ok;
}

// Per-location: recurring billing (card + subscription + minutes), comp minutes,
// and access toggle. Card entry happens on Stripe's hosted page — never here.
export function LocationActions({
  officeId,
  accessActive,
  hasCard,
  recurringUsageMin,
  renewsOn,
  contactEmail,
  contacts,
}: {
  officeId: string;
  accessActive: boolean;
  hasCard: boolean;
  recurringUsageMin: number;
  renewsOn: string | null;
  contactEmail: string | null;
  contacts: { name: string; email: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

  async function grant() {
    const v = window.prompt("Grant how many complimentary (free) minutes?");
    if (!v) return;
    const minutes = Math.round(Number(v));
    if (!minutes || minutes < 1) return;
    setBusy(true);
    await post("/api/platform/minutes", { officeId, minutes });
    router.refresh();
    setBusy(false);
  }
  async function access() {
    const action = accessActive ? "pause" : "activate";
    if (action === "pause" && !window.confirm("Pause access for this practice? This revokes their app access and stops Stripe billing (no future charges). You can reinstate it later.")) return;
    setBusy(true);
    const res = await fetch("/api/platform/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ officeId, action }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.warning) window.alert(j.warning);
    router.refresh();
    setBusy(false);
  }
  async function portal() {
    setBusy(true);
    const res = await fetch("/api/platform/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "portal", officeId }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.url) window.open(j.url, "_blank");
    else window.alert(j.error ?? "Couldn't open the billing portal.");
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
      {recurringUsageMin > 0 ? (
        <span className="chip mint" title={renewsOn ? `Renews ${new Date(renewsOn).toLocaleDateString()}` : undefined} style={{ padding: "5px 10px", fontSize: 11.5 }}>
          Recurring · {recurringUsageMin} min/mo
        </span>
      ) : (
        <button className="btn btn-ghost" disabled={busy} onClick={() => setBillOpen(true)} style={{ padding: "5px 10px", fontSize: 12, color: "var(--purple-2)" }}>
          Set up billing
        </button>
      )}
      {hasCard && (
        <button className="btn btn-ghost" disabled={busy} onClick={portal} style={{ padding: "5px 10px", fontSize: 12 }}>Card</button>
      )}
      <button className="btn btn-ghost" disabled={busy} onClick={grant} style={{ padding: "5px 10px", fontSize: 12 }}>+ Minutes</button>
      <button className="btn btn-ghost" disabled={busy} onClick={access} style={{ padding: "5px 10px", fontSize: 12, color: accessActive ? "var(--amber)" : "var(--mint)" }}>
        {accessActive ? "Pause access" : "Reinstate"}
      </button>
      {billOpen && <BillingModal officeId={officeId} defaultEmail={contactEmail} contacts={contacts} onClose={() => { setBillOpen(false); router.refresh(); }} />}
    </div>
  );
}

// Super-admin recurring-billing setup: pick the monthly access + usage amounts
// (tax-inclusive) and the minute allowance, then continue to Stripe's hosted
// checkout to enter the card. Billing recurs on today's day-of-month.
function BillingModal({ officeId, defaultEmail, contacts, onClose }: { officeId: string; defaultEmail: string | null; contacts: { name: string; email: string }[]; onClose: () => void }) {
  const [access, setAccess] = useState("44.95");
  const [usage, setUsage] = useState("205.05");
  const [minutes, setMinutes] = useState("285");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const total = (Number(access) || 0) + (Number(usage) || 0);
  const listId = `contacts-${officeId}`;

  async function go() {
    setErr(null);
    const contact = email.trim();
    if (!contact || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
      setErr("Enter a valid billing contact email.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/platform/billing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "setup_recurring", officeId, contactEmail: contact, accessCents: Math.round((Number(access) || 0) * 100), usageCents: Math.round((Number(usage) || 0) * 100), usageMinutes: Math.round(Number(minutes) || 0) }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.url) { window.location.href = j.url; return; } // → Stripe checkout (enter card)
    setErr(j.error ?? "Couldn't start billing setup.");
    setBusy(false);
  }

  const field = (label: string, value: string, set: (v: string) => void, prefix?: string) => (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {prefix && <span className="muted">{prefix}</span>}
        <input className="input" value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" style={{ width: "100%" }} />
      </div>
    </label>
  );

  return (
    <ModalShell onClose={onClose} width={460}>
      <div className="card-pad">
        <h3 style={{ fontSize: 19, marginBottom: 4 }}>Set up recurring billing</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
          Monthly, tax-inclusive, billed on today&apos;s date. The card is entered on Stripe&apos;s secure page — never here. When the minutes run out, calls pause until the next cycle (no overage).
        </p>
        {err && <div className="banner error" style={{ marginBottom: 14 }}>{err}</div>}
        <label style={{ display: "block", marginBottom: 14 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Billing contact — gets Stripe receipts</div>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} list={listId} type="email" placeholder="name@practice.com" style={{ width: "100%" }} />
          <datalist id={listId}>
            {contacts.filter((c) => c.email).map((c) => (
              <option key={c.email} value={c.email}>{c.name}</option>
            ))}
          </datalist>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>Pick a person at this account, or type any email. Receipts and invoices go here.</div>
        </label>
        {field("Access — $/month (tax incl.)", access, setAccess, "$")}
        {field("Usage — $/month (tax incl.)", usage, setUsage, "$")}
        {field("Minutes granted each month", minutes, setMinutes)}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, marginBottom: 18 }}>
          <span className="muted" style={{ fontSize: 13 }}>Total per month</span>
          <span className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 20 }}>${total.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={go} disabled={busy || total <= 0}>{busy ? "Starting…" : "Continue to Stripe"}</button>
        </div>
      </div>
    </ModalShell>
  );
}

// Per-user: view-as, role change, deactivate/reactivate.
export function UserActions({ userId, status, role }: { userId: string; status: string; role: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const editable = role === "SETTER" || role === "OFFICE_ADMIN" || role === "GROUP_ADMIN";

  async function impersonate() {
    setBusy(true);
    const ok = await post("/api/platform/impersonate", { userId });
    if (ok) { router.replace("/go"); router.refresh(); return; }
    setBusy(false);
  }
  async function toggle() {
    setBusy(true);
    await post("/api/platform/user", { userId, action: status === "DISABLED" ? "reactivate" : "deactivate" });
    router.refresh();
    setBusy(false);
  }
  async function changeRole(r: string) {
    setBusy(true);
    await post("/api/platform/user", { userId, action: "role", role: r });
    router.refresh();
    setBusy(false);
  }
  async function resend() {
    setBusy(true);
    const res = await fetch("/api/platform/user", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, action: "resend_invite" }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) window.alert(j.emailed ? "Invite email sent." : `Email isn't configured here — share this link:\n\n${j.previewLink ?? "(no link)"}`);
    else window.alert(j.error ?? "Couldn't resend the invite.");
    router.refresh();
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {editable && (
        <select value={role} disabled={busy} onChange={(e) => changeRole(e.target.value)} className="input" style={{ padding: "4px 6px", fontSize: 11.5 }}>
          <option value="SETTER">Setter</option>
          <option value="OFFICE_ADMIN">Office manager</option>
          <option value="GROUP_ADMIN">Group admin</option>
        </select>
      )}
      {status === "INVITED" && (
        <button className="btn btn-ghost" disabled={busy} onClick={resend} style={{ padding: "4px 9px", fontSize: 11.5, color: "var(--purple-2)" }}>Resend invite</button>
      )}
      <button className="btn btn-ghost" disabled={busy} onClick={impersonate} style={{ padding: "4px 9px", fontSize: 11.5 }}>View as</button>
      <button className="btn btn-ghost" disabled={busy} onClick={toggle} style={{ padding: "4px 9px", fontSize: 11.5, color: status === "DISABLED" ? "var(--mint)" : "var(--amber)" }}>
        {status === "DISABLED" ? "Reactivate" : "Deactivate"}
      </button>
    </div>
  );
}
