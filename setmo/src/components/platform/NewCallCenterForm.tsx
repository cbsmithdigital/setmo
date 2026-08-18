"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

const lab = { fontSize: 11.5, fontWeight: 700 as const, textTransform: "uppercase" as const, color: "var(--muted)", letterSpacing: ".02em", marginBottom: 5, display: "block" };

export function NewCallCenterForm() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", adminEmail: "", adminName: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function create() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/platform/callcenter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "err", text: j.error ?? "Couldn't create it" }); return; }
    setMsg({ kind: "ok", text: j.previewLink ? `Created. Senior-admin invite link: ${j.previewLink}` : "Created — the senior admin was invited by email." });
    setF({ name: "", adminEmail: "", adminName: "" });
    router.refresh();
  }

  return (
    <div className="card card-pad">
      <h3 style={{ fontSize: 17, marginBottom: 12 }}>New call center</h3>
      <div className="grid g-3" style={{ gap: 12, marginBottom: 12 }}>
        <label><span style={lab}>Call center name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. BrightCall Partners" /></label>
        <label><span style={lab}>Senior admin email</span><input className="input" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} placeholder="owner@example.com" /></label>
        <label><span style={lab}>Senior admin name</span><input className="input" value={f.adminName} onChange={(e) => setF({ ...f, adminName: e.target.value })} placeholder="Full name" /></label>
      </div>
      <button className="btn btn-primary" onClick={create} disabled={busy || !f.name.trim() || !f.adminEmail.trim()} style={{ padding: "9px 18px" }}>
        <Icon name="building" size={15} /> {busy ? "Creating…" : "Create call center"}
      </button>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Creates the call center + a first pod and invites the senior manager. They build out pods, agents, and served offices from their console.</p>
      {msg && <p style={{ fontSize: 12.5, marginTop: 8, color: msg.kind === "ok" ? "var(--mint)" : "var(--amber)", wordBreak: "break-all" }}>{msg.text}</p>}
    </div>
  );
}
