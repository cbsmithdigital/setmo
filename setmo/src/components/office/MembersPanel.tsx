"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABEL } from "@/lib/format";
import type { MemberRow } from "@/lib/office";

const GROUPS: { key: MemberRow["status"]; label: string; hint: string }[] = [
  { key: "INVITED", label: "Invited", hint: "Sent an invite — hasn't joined yet" },
  { key: "ACTIVE", label: "Current users", hint: "Active members" },
  { key: "DISABLED", label: "Disabled", hint: "No longer have access" },
];

function MemberItem({ m, isSelf }: { m: MemberRow; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/office/invites/resend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: m.id }) });
      setMsg(res.ok ? "Sent ✓" : "Failed");
    } catch {
      setMsg("Failed");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "ACTIVE" | "DISABLED") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/office/members/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: m.id, status }) });
      if (res.ok) router.refresh();
      else setMsg("Failed");
    } catch {
      setMsg("Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderTop: "1px solid var(--line-soft)" }}>
      <div className="lb-av" style={{ width: 36, height: 36, fontSize: 12.5, flex: "none", opacity: m.status === "DISABLED" ? 0.5 : 1 }}>{m.initials || "?"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name || m.email}</div>
        <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
        {m.roles.map((r) => (
          <span key={r} className="chip" style={{ padding: "2px 8px", fontSize: 11 }}>{ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r}</span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 96, justifyContent: "flex-end" }}>
        {msg && <span className="muted" style={{ fontSize: 12 }}>{msg}</span>}
        {m.status === "INVITED" && (
          <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={resend}>Resend</button>
        )}
        {m.status === "ACTIVE" && !isSelf && (
          <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={() => setStatus("DISABLED")}>Disable</button>
        )}
        {m.status === "DISABLED" && (
          <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={busy} onClick={() => setStatus("ACTIVE")}>Enable</button>
        )}
      </div>
    </div>
  );
}

export function MembersPanel({ members, currentUserId }: { members: MemberRow[]; currentUserId: string }) {
  return (
    <div className="card card-pad rise" style={{ marginBottom: 18 }}>
      <h3 style={{ fontSize: 18, marginBottom: 4 }}>Team members</h3>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Everyone on this practice, by status. Resend invites, or disable people who&apos;ve left.</p>

      {GROUPS.map((g) => {
        const rows = members.filter((m) => m.status === g.key);
        if (g.key === "DISABLED" && rows.length === 0) return null; // hide empty disabled section
        return (
          <div key={g.key} style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)" }}>{g.label}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>· {rows.length}</span>
            </div>
            {rows.length === 0 ? (
              <p className="muted" style={{ fontSize: 13, padding: "8px 4px" }}>{g.key === "INVITED" ? "No pending invites." : "None yet."}</p>
            ) : (
              rows.map((m) => <MemberItem key={m.id} m={m} isSelf={m.id === currentUserId} />)
            )}
          </div>
        );
      })}
    </div>
  );
}
