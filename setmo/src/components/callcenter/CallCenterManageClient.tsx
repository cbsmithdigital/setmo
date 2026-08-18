"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

type Pod = { id: string; name: string };
type Office = { id: string; name: string; city: string | null; podId: string | null; podName: string };
type Manager = { id: string; name: string; email: string; role: string; status: string; podName: string };
type Agent = { id: string; name: string; email: string; status: string; podId: string | null; podName: string; officeIds: string[] };
type Data = { name: string; pods: Pod[]; managers: Manager[]; agents: Agent[]; offices: Office[] };

async function post(url: string, body: object) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, ...j } as { ok: boolean; error?: string; previewLink?: string };
}

const lab = { fontSize: 11.5, fontWeight: 700 as const, textTransform: "uppercase" as const, color: "var(--muted)", letterSpacing: ".02em", marginBottom: 5, display: "block" };
function Msg({ m }: { m: { kind: "ok" | "err"; text: string } | null }) {
  if (!m) return null;
  return <p style={{ fontSize: 12.5, marginTop: 8, color: m.kind === "ok" ? "var(--mint)" : "var(--amber)", wordBreak: "break-all" }}>{m.text}</p>;
}

export function CallCenterManageClient({ data }: { data: Data }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  // Add pod
  const [podName, setPodName] = useState("");
  const [podMsg, setPodMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  async function addPod() {
    const r = await post("/api/callcenter/pods", { name: podName });
    setPodMsg(r.ok ? { kind: "ok", text: "Pod added" } : { kind: "err", text: r.error ?? "Failed" });
    if (r.ok) { setPodName(""); refresh(); }
  }

  // Add office
  const [off, setOff] = useState({ name: "", city: "", podId: data.pods[0]?.id ?? "" });
  const [offMsg, setOffMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  async function addOffice() {
    const r = await post("/api/callcenter/offices", off);
    setOffMsg(r.ok ? { kind: "ok", text: "Office added" } : { kind: "err", text: r.error ?? "Failed" });
    if (r.ok) { setOff({ name: "", city: "", podId: off.podId }); refresh(); }
  }

  // Invite member (manager or agent)
  const [inv, setInv] = useState<{ email: string; name: string; role: "CALL_CENTER_MANAGER" | "SETTER"; podId: string; officeIds: string[] }>({ email: "", name: "", role: "SETTER", podId: data.pods[0]?.id ?? "", officeIds: [] });
  const [invMsg, setInvMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const podOffices = data.offices.filter((o) => o.podId === inv.podId);
  async function invite() {
    const body = inv.role === "SETTER" ? inv : { email: inv.email, name: inv.name, role: inv.role, podId: inv.podId };
    const r = await post("/api/callcenter/members", body);
    if (r.ok) { setInvMsg({ kind: "ok", text: r.previewLink ? `Invited. Link: ${r.previewLink}` : "Invite sent" }); setInv({ ...inv, email: "", name: "", officeIds: [] }); refresh(); }
    else setInvMsg({ kind: "err", text: r.error ?? "Failed" });
  }

  const podLabel = (id: string | null) => data.pods.find((p) => p.id === id)?.name ?? "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Pods */}
      <div className="card card-pad">
        <h3 style={{ fontSize: 17, marginBottom: 12 }}>Pods</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {data.pods.map((p) => <span key={p.id} className="chip" style={{ padding: "5px 12px" }}>{p.name}</span>)}
          {data.pods.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No pods yet.</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <label><span style={lab}>New pod</span><input className="input" value={podName} onChange={(e) => setPodName(e.target.value)} placeholder="e.g. Pod North" style={{ width: 220 }} /></label>
          <button className="btn btn-ghost" onClick={addPod} disabled={!podName.trim()} style={{ padding: "9px 14px" }}>Add pod</button>
        </div>
        <Msg m={podMsg} />
      </div>

      {/* Invite */}
      <div className="card card-pad">
        <h3 style={{ fontSize: 17, marginBottom: 12 }}>Invite a manager or agent</h3>
        <div className="grid g-2" style={{ gap: 12, marginBottom: 12 }}>
          <label><span style={lab}>Email</span><input className="input" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} placeholder="name@example.com" /></label>
          <label><span style={lab}>Name</span><input className="input" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} placeholder="Full name" /></label>
          <label><span style={lab}>Role</span>
            <select className="input" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as "CALL_CENTER_MANAGER" | "SETTER", officeIds: [] })}>
              <option value="SETTER">Phone agent</option>
              <option value="CALL_CENTER_MANAGER">Floor manager</option>
            </select>
          </label>
          <label><span style={lab}>Pod</span>
            <select className="input" value={inv.podId} onChange={(e) => setInv({ ...inv, podId: e.target.value, officeIds: [] })}>
              {data.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        {inv.role === "SETTER" && (
          <div style={{ marginBottom: 12 }}>
            <span style={lab}>Assigned offices (this pod)</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {podOffices.map((o) => {
                const on = inv.officeIds.includes(o.id);
                return (
                  <button key={o.id} onClick={() => setInv({ ...inv, officeIds: on ? inv.officeIds.filter((x) => x !== o.id) : [...inv.officeIds, o.id] })}
                    className="chip" style={{ padding: "5px 12px", borderColor: on ? "var(--purple)" : "var(--line)", color: on ? "#fff" : "var(--muted)", background: on ? "rgba(139,92,246,.16)" : "var(--s2)" }}>
                    {on ? "✓ " : ""}{o.name}
                  </button>
                );
              })}
              {podOffices.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Add an office to this pod first.</span>}
            </div>
          </div>
        )}
        <button className="btn btn-primary" onClick={invite} disabled={!inv.email.trim() || !inv.podId} style={{ padding: "9px 18px" }}><Icon name="team" size={15} /> Send invite</button>
        <Msg m={invMsg} />
      </div>

      {/* Served offices */}
      <div className="card card-pad">
        <h3 style={{ fontSize: 17, marginBottom: 12 }}>Served offices</h3>
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 14 }}>
          {data.offices.map((o) => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line-soft)", fontSize: 13.5 }}>
              <span>{o.name}{o.city ? <span className="muted"> · {o.city}</span> : null}</span>
              <span className="muted">{o.podName}</span>
            </div>
          ))}
          {data.offices.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No served offices yet.</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label><span style={lab}>Practice name</span><input className="input" value={off.name} onChange={(e) => setOff({ ...off, name: e.target.value })} placeholder="e.g. Cedar Park Dental" style={{ width: 200 }} /></label>
          <label><span style={lab}>City</span><input className="input" value={off.city} onChange={(e) => setOff({ ...off, city: e.target.value })} style={{ width: 130 }} /></label>
          <label><span style={lab}>Pod</span><select className="input" value={off.podId} onChange={(e) => setOff({ ...off, podId: e.target.value })}>{data.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <button className="btn btn-ghost" onClick={addOffice} disabled={!off.name.trim() || !off.podId} style={{ padding: "9px 14px" }}>Add office</button>
        </div>
        <Msg m={offMsg} />
      </div>

      {/* Roster */}
      <div className="card card-pad">
        <h3 style={{ fontSize: 17, marginBottom: 12 }}>Team</h3>
        {[...data.managers, ...data.agents].length === 0 ? (
          <span className="muted" style={{ fontSize: 13 }}>No one invited yet.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.managers.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "1px solid var(--line-soft)", fontSize: 13.5 }}>
                <div><b>{m.name || m.email}</b> <span className="muted">· {m.email}</span></div>
                <div className="muted" style={{ fontSize: 12 }}>{m.role === "CALL_CENTER_ADMIN" ? "Senior manager" : `Floor manager · ${m.podName}`}{m.status !== "ACTIVE" ? ` · ${m.status.toLowerCase()}` : ""}</div>
              </div>
            ))}
            {data.agents.map((a) => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "1px solid var(--line-soft)", fontSize: 13.5 }}>
                <div><b>{a.name || a.email}</b> <span className="muted">· {a.email}</span></div>
                <div className="muted" style={{ fontSize: 12 }}>Agent · {podLabel(a.podId)} · {a.officeIds.length} office{a.officeIds.length === 1 ? "" : "s"}{a.status !== "ACTIVE" ? ` · ${a.status.toLowerCase()}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
