"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ServiceRow = {
  key: string;
  name: string;
  status: string;
  hasPack: boolean;
  offices: number;
  sessions: number;
};

const STATUSES = ["PLANNED", "DRAFT", "LIVE"] as const;

const STATUS_HELP: Record<string, string> = {
  PLANNED: "Hidden from practices — shows as \"Soon\".",
  DRAFT: "Visible as \"Soon\"; practices can pre-select it, nobody can call yet.",
  LIVE: "Practices that switch it on can run calls.",
};

// Roll a call type out or pull it back. This is the only place a service's
// status changes, and every change is audit-logged.
export function ServiceCatalog({ services }: { services: ServiceRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function setStatus(serviceType: string, status: string) {
    setBusy(serviceType);
    setMsg(null);
    const res = await fetch("/api/platform/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serviceType, status }),
    });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? `${serviceType} is now ${status}.` : body.error ?? "Couldn't change that.");
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="card card-pad">
      <h3 style={{ fontSize: 17, marginBottom: 4 }}>Call types</h3>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
        What practices can turn on. A call type only goes live once it has its own lead personas and rubric — otherwise it
        would be graded as an implant call.
      </p>
      {services.map((s, i) => (
        <div
          key={s.key}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid var(--line-soft)" : "none", flexWrap: "wrap" }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {s.name}
              {!s.hasPack && (
                <span className="chip amber" style={{ fontSize: 10.5, marginLeft: 8 }}>no pack yet</span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {s.offices} office{s.offices === 1 ? "" : "s"} · {s.sessions} call{s.sessions === 1 ? "" : "s"} · {STATUS_HELP[s.status] ?? ""}
            </div>
          </div>
          <select
            className="input"
            value={s.status}
            disabled={busy === s.key}
            onChange={(e) => setStatus(s.key, e.target.value)}
            style={{ padding: "5px 8px", fontSize: 12.5, width: 130 }}
          >
            {STATUSES.map((st) => (
              <option key={st} value={st} disabled={st === "LIVE" && !s.hasPack}>
                {st}
              </option>
            ))}
          </select>
        </div>
      ))}
      {msg && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
