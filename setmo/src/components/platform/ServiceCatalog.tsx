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
  pilots: { officeId: string; name: string }[];
};

const STATUSES = ["PLANNED", "DRAFT", "BETA", "LIVE"] as const;

const STATUS_HELP: Record<string, string> = {
  PLANNED: "Hidden from practices — shows as \"Soon\".",
  DRAFT: "Visible as \"Soon\"; practices can pre-select it, nobody can call yet.",
  BETA: "Only the pilot practices below can run it.",
  LIVE: "Practices that switch it on can run calls.",
};

// Roll a call type out or pull it back. This is the only place a service's
// status changes, and every change is audit-logged.
export function ServiceCatalog({ services, offices }: { services: ServiceRow[]; offices: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(body: object, label: string) {
    setBusy(label);
    setMsg(null);
    const res = await fetch("/api/platform/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Saved." : json.error ?? "Couldn't change that.");
    setBusy(null);
    router.refresh();
  }

  const setStatus = (serviceType: string, status: string) =>
    post({ action: "status", serviceType, status }, serviceType);
  const setPilot = (serviceType: string, officeId: string, pilot: boolean) =>
    post({ action: "pilot", serviceType, officeId, pilot }, serviceType);

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
              <option key={st} value={st} disabled={(st === "LIVE" || st === "BETA") && !s.hasPack}>
                {st}
              </option>
            ))}
          </select>
          {s.status === "BETA" && (
            <div style={{ width: "100%", paddingLeft: 4 }}>
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>Pilot practices</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {s.pilots.map((p) => (
                  <button
                    key={p.officeId}
                    className="chip purple"
                    disabled={busy === s.key}
                    onClick={() => setPilot(s.key, p.officeId, false)}
                    style={{ fontSize: 11.5 }}
                    title="Remove from the beta"
                  >
                    {p.name} ✕
                  </button>
                ))}
                <select
                  className="input"
                  value=""
                  disabled={busy === s.key}
                  onChange={(e) => e.target.value && setPilot(s.key, e.target.value, true)}
                  style={{ padding: "4px 8px", fontSize: 12, width: 220 }}
                >
                  <option value="">Add a practice…</option>
                  {offices
                    .filter((o) => !s.pilots.some((p) => p.officeId === o.id))
                    .map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                </select>
              </div>
            </div>
          )}
        </div>
      ))}
      {msg && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
