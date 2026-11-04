"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Platform → Accounts → New account: set up a practice or group for its owner.
// The owner gets a setup email (password + Terms), a 14-day free trial with a
// complimentary hour, and adds a card from Billing when they're ready.

type Created = { accountId: string; name: string; email: string; emailed: boolean; link: string | null };

export function NewAccount({ partners }: { partners: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"practice" | "group">("practice");
  const [orgName, setOrgName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [city, setCity] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [trial, setTrial] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const accountName = kind === "group" ? orgName.trim() : practiceName.trim();
  const ready = practiceName.trim().length >= 2 && ownerName.trim().length >= 2 && /\S+@\S+\.\S+/.test(ownerEmail) && (kind === "practice" || orgName.trim().length >= 2);

  function reset() {
    setKind("practice");
    setOrgName("");
    setPracticeName("");
    setCity("");
    setOwnerName("");
    setOwnerEmail("");
    setPartnerId("");
    setTrial(true);
    setErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const email = ownerEmail.trim().toLowerCase();
    if (!window.confirm(`Set up ${accountName} and email ${email} a link to finish setting it up?${trial ? "\n\nIt starts a 14-day free trial with a complimentary hour of practice calls." : ""}`)) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/platform/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create",
        kind,
        orgName: kind === "group" ? orgName.trim() : null,
        practiceName: practiceName.trim(),
        city: city.trim() || null,
        ownerName: ownerName.trim(),
        ownerEmail: email,
        partnerId: partnerId || null,
        trial,
      }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) return setErr(j.error ?? "Couldn't set up the account. Try again.");
    setCreated({ accountId: j.accountId, name: accountName, email, emailed: Boolean(j.emailed), link: j.link ?? null });
    reset();
    router.refresh();
  }

  const field = { display: "grid", gap: 4, fontSize: 12.5, flex: "1 1 220px" } as const;

  if (!open) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={() => { setOpen(true); setCreated(null); }} style={{ padding: "9px 16px" }}>
          + New account
        </button>
      </div>
    );
  }

  return (
    <div className="card card-pad rise" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h3 style={{ fontSize: 17 }}>New account</h3>
        <button className="btn btn-ghost" onClick={() => { setOpen(false); setCreated(null); reset(); }} style={{ padding: "6px 12px", fontSize: 12.5 }}>
          Close
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
        Sets up the practice (or group) and emails the owner a link to choose a password and agree to the Terms. They add a card from Billing when they&apos;re ready.
      </p>

      {created && (
        <div className="banner mint" style={{ marginBottom: 14 }}>
          <b>{created.name}</b> is set up.{" "}
          {created.emailed ? `The setup email went to ${created.email}.` : `The email didn't send — send ${created.email} this setup link yourself:`}{" "}
          <Link href={`/platform/accounts/${created.accountId}`} style={{ fontWeight: 600 }}>Open the account →</Link>
          {created.link && (
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code style={{ fontSize: 12, wordBreak: "break-all", flex: 1 }}>{created.link}</code>
              <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => navigator.clipboard?.writeText(created.link!)}>
                Copy
              </button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={submit} autoComplete="off">
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {(["practice", "group"] as const).map((k) => (
            <button key={k} type="button" className={"chip" + (kind === k ? " purple" : "")} onClick={() => setKind(k)}>
              {k === "practice" ? "Single practice" : "Group / DSO"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          {kind === "group" && (
            <label style={field}>
              <span className="muted">Group name</span>
              <input className="input" name="new-account-group" autoComplete="off" data-1p-ignore data-lpignore="true" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Bright Smiles Dental Group" />
            </label>
          )}
          <label style={field}>
            <span className="muted">{kind === "group" ? "First location" : "Practice name"}</span>
            <input className="input" name="new-account-practice" autoComplete="off" data-1p-ignore data-lpignore="true" value={practiceName} onChange={(e) => setPracticeName(e.target.value)} placeholder="Bright Smiles — Boise" />
          </label>
          <label style={{ ...field, flex: "0 1 180px" }}>
            <span className="muted">City (optional)</span>
            <input className="input" name="new-account-city" autoComplete="off" data-1p-ignore data-lpignore="true" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Boise" />
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <label style={field}>
            <span className="muted">Owner&apos;s name</span>
            <input className="input" name="new-account-owner" autoComplete="off" data-1p-ignore data-lpignore="true" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Dana Reyes" />
          </label>
          <label style={field}>
            <span className="muted">Owner&apos;s email</span>
            <input className="input" type="email" name="new-account-owner-email" autoComplete="off" data-1p-ignore data-lpignore="true" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="dana@brightsmiles.com" />
          </label>
          <label style={{ ...field, flex: "0 1 220px" }}>
            <span className="muted">Referred by (optional)</span>
            <select className="input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">No partner</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.5, color: "var(--text-2)", marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: "var(--purple)", flexShrink: 0 }} />
          <span>
            <b>14-day free trial</b> with a complimentary hour of practice calls (600 tokens). After it ends they activate from Billing — Practice Access plus tokens, at standard pricing.
          </span>
        </label>
        {err && <p style={{ color: "var(--amber)", fontSize: 13, marginBottom: 10 }}>{err}</p>}
        <button className="btn btn-primary" type="submit" disabled={!ready || busy} style={{ padding: "9px 18px" }}>
          {busy ? "Setting up…" : "Set up account & email the owner"}
        </button>
      </form>
    </div>
  );
}
