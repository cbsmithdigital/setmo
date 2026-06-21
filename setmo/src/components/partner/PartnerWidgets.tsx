"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <code style={{ background: "var(--s1)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--text-1)" }}>{link}</code>
      <button className="btn btn-ghost" style={{ padding: "7px 12px", fontSize: 13 }} onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

export function PayoutToggle({ method, hasPractice }: { method: "CASH" | "CREDIT"; hasPractice: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function set(m: "CASH" | "CREDIT") {
    if (m === method) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/partner/payout-method", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method: m }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error ?? "Couldn't change"); return; }
    router.refresh();
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 6, background: "var(--s1)", border: "1px solid var(--line)", borderRadius: 99, padding: 4, width: "fit-content" }}>
        {(["CASH", "CREDIT"] as const).map((m) => (
          <button key={m} disabled={busy} onClick={() => set(m)} className={"btn " + (method === m ? "btn-primary" : "")} style={{ padding: "6px 16px", fontSize: 13, color: method === m ? "#fff" : "var(--muted)" }}>
            {m === "CASH" ? "Cash" : "Credit (+5%)"}
          </button>
        ))}
      </div>
      {!hasPractice && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Credit needs a linked SetMo practice on your account.</p>}
      {err && <p style={{ color: "var(--amber)", fontSize: 12.5, marginTop: 6 }}>{err}</p>}
    </div>
  );
}

export function ConnectButton({ onboarded }: { onboarded: boolean }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const res = await fetch("/api/partner/connect", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    if (j.url) { window.location.href = j.url; return; }
    setBusy(false);
  }
  if (onboarded) return <span className="chip mint" style={{ padding: "4px 12px" }}>Payouts active ✓</span>;
  return (
    <button className="btn btn-primary" onClick={go} disabled={busy} style={{ padding: "9px 16px" }}>
      {busy ? "Opening…" : "Set up cash payouts"}
    </button>
  );
}

export function InviteMember() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function invite() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/partner/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, name }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error ?? "Couldn't invite"); return; }
    if (j.inviteLink) window.prompt("Rep added. Email isn't configured — share this setup link:", j.inviteLink);
    setEmail(""); setName("");
    router.refresh();
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" placeholder="Rep name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 160 }} />
        <input className="input" type="email" placeholder="rep@email.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn btn-primary" onClick={invite} disabled={busy || !email || !name} style={{ padding: "9px 16px" }}>
          <Icon name="team" size={15} /> {busy ? "Adding…" : "Add rep"}
        </button>
      </div>
      {err && <p style={{ color: "var(--amber)", fontSize: 13, marginTop: 8 }}>{err}</p>}
    </div>
  );
}
