"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: object, method = "POST") {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.ok;
}

// Per-location: grant comp minutes + toggle access.
export function LocationActions({ officeId, accessActive }: { officeId: string; accessActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function grant() {
    const v = window.prompt("Grant how many complimentary minutes?");
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

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <button className="btn btn-ghost" disabled={busy} onClick={grant} style={{ padding: "5px 10px", fontSize: 12 }}>+ Minutes</button>
      <button className="btn btn-ghost" disabled={busy} onClick={access} style={{ padding: "5px 10px", fontSize: 12, color: accessActive ? "var(--amber)" : "var(--mint)" }}>
        {accessActive ? "Pause access" : "Reinstate"}
      </button>
    </div>
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

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {editable && (
        <select value={role} disabled={busy} onChange={(e) => changeRole(e.target.value)} className="input" style={{ padding: "4px 6px", fontSize: 11.5 }}>
          <option value="SETTER">Setter</option>
          <option value="OFFICE_ADMIN">Office manager</option>
          <option value="GROUP_ADMIN">Group admin</option>
        </select>
      )}
      <button className="btn btn-ghost" disabled={busy} onClick={impersonate} style={{ padding: "4px 9px", fontSize: 11.5 }}>View as</button>
      <button className="btn btn-ghost" disabled={busy} onClick={toggle} style={{ padding: "4px 9px", fontSize: 11.5, color: status === "DISABLED" ? "var(--mint)" : "var(--amber)" }}>
        {status === "DISABLED" ? "Reactivate" : "Deactivate"}
      </button>
    </div>
  );
}
