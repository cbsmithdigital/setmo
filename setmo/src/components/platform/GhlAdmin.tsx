"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(body: object): Promise<{ ok: boolean; error?: string; replayed?: number }> {
  const res = await fetch("/api/platform/ghl", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, ...(await res.json().catch(() => ({}))) };
}

export function GhlConnectForm({ offices }: { offices: { id: string; name: string }[] }) {
  const router = useRouter();
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? "");
  const [locationId, setLocationId] = useState("");
  const [pit, setPit] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setErr(null);
    if (!officeId || locationId.trim().length < 3) { setErr("Pick an office and enter the GHL location id."); return; }
    setBusy(true);
    const r = await post({ action: "create", officeId, ghlLocationId: locationId.trim(), pitToken: pit.trim() || undefined });
    if (!r.ok) { setErr(r.error ?? "Couldn't connect."); setBusy(false); return; }
    setLocationId(""); setPit("");
    router.refresh();
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={{ flex: "1 1 180px" }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Practice (office)</div>
        <select className="input" value={officeId} onChange={(e) => setOfficeId(e.target.value)} style={{ width: "100%" }}>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <label style={{ flex: "1 1 180px" }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>GHL location (sub-account) id</div>
        <input className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="GYNV5DSq…" style={{ width: "100%" }} />
      </label>
      <label style={{ flex: "1 1 180px" }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>PIT (optional)</div>
        <input className="input" value={pit} onChange={(e) => setPit(e.target.value)} placeholder="pit-…" style={{ width: "100%" }} />
      </label>
      <button className="btn btn-primary" disabled={busy} onClick={go}>{busy ? "Connecting…" : "Connect"}</button>
      {err && <div className="banner error" style={{ width: "100%" }}>{err}</div>}
    </div>
  );
}

export function GhlMapUserForm({ ghlUserId: initial }: { ghlUserId?: string }) {
  const router = useRouter();
  const [ghlUserId, setGhlUserId] = useState(initial ?? "");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    setMsg(null);
    setBusy(true);
    const r = await post({ action: "map_user", ghlUserId: ghlUserId.trim(), email: email.trim() });
    setMsg(r.ok ? `Mapped.${r.replayed ? ` Replaying ${r.replayed} held call${r.replayed === 1 ? "" : "s"} in the background — refresh in a couple minutes.` : ""}` : r.error ?? "Failed.");
    if (r.ok) { setEmail(""); if (!initial) setGhlUserId(""); router.refresh(); }
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input className="input" value={ghlUserId} onChange={(e) => setGhlUserId(e.target.value)} placeholder="GHL user id" style={{ width: 170, fontSize: 12.5 }} disabled={Boolean(initial)} />
      <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="setter@practice.com" style={{ width: 200, fontSize: 12.5 }} />
      <button className="btn btn-ghost" disabled={busy || !ghlUserId || !email} onClick={go} style={{ padding: "6px 12px", fontSize: 12.5 }}>Map</button>
      {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
    </div>
  );
}

export function GhlToggleButton({ integrationId, status }: { integrationId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-ghost"
      disabled={busy}
      onClick={async () => { setBusy(true); await post({ action: "toggle", integrationId }); router.refresh(); setBusy(false); }}
      style={{ padding: "5px 10px", fontSize: 12, color: status === "ACTIVE" ? "var(--amber)" : "var(--mint)" }}
    >
      {status === "ACTIVE" ? "Pause" : "Resume"}
    </button>
  );
}
