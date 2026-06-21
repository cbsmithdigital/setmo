"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Admin = { id: string; email: string; name: string; role: string };

export function AdminsManager({ admins, selfId }: { admins: Admin[]; selfId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("SUPPORT");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function call(body: object, key: string) {
    setBusy(key);
    setErr(null);
    const res = await fetch("/api/platform/admins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setErr(j.error ?? "Something went wrong"); return false; }
    router.refresh();
    return true;
  }

  async function add() {
    const ok = await call({ action: "add", email, role, password: password || undefined }, "add");
    if (ok) { setEmail(""); setPassword(""); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card card-pad">
        <h3 style={{ fontSize: 17, marginBottom: 12 }}>Add internal admin</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input" type="email" placeholder="teammate@growdental.ai" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 180 }}>
            <option value="SUPPORT">Success / Support</option>
            <option value="PLATFORM_ADMIN">Super Admin</option>
          </select>
          <input className="input" type="password" placeholder="Temp password (if new)" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: 200 }} />
          <button className="btn btn-primary" onClick={add} disabled={busy === "add" || !email} style={{ padding: "9px 16px" }}>{busy === "add" ? "Adding…" : "Add"}</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>If the email already has an account, the password is ignored. Otherwise it creates one they can reset later.</p>
        {err && <p style={{ color: "var(--amber)", fontSize: 13, marginTop: 8 }}>{err}</p>}
      </div>

      <div className="card card-pad">
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Internal admins ({admins.length})</h3>
        {admins.map((a, i) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name || a.email}{a.id === selfId && <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · you</span>}</div>
              <div className="muted" style={{ fontSize: 12 }}>{a.email}</div>
            </div>
            {a.id === selfId ? (
              <span className="chip" style={{ padding: "3px 10px", fontSize: 12 }}>{a.role === "PLATFORM_ADMIN" ? "Super Admin" : "Support"}</span>
            ) : (
              <>
                <select className="input" value={a.role} disabled={busy === a.id} onChange={(e) => call({ action: "role", userId: a.id, role: e.target.value }, a.id)} style={{ width: 170, fontSize: 12.5 }}>
                  <option value="SUPPORT">Success / Support</option>
                  <option value="PLATFORM_ADMIN">Super Admin</option>
                </select>
                <button className="btn btn-ghost" disabled={busy === a.id} onClick={() => { if (confirm(`Revoke admin access for ${a.email}?`)) call({ action: "revoke", userId: a.id }, a.id); }} style={{ padding: "6px 12px", fontSize: 12.5, color: "var(--amber)" }}>Revoke</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
