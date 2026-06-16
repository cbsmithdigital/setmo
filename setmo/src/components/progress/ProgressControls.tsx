"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESETS: { key: string; label: string }[] = [
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "all", label: "All time" },
];

// Timeframe selector. Changing it updates the URL (?range=…), which re-renders
// the page's server data for that window. Progress is always compared to the
// immediately-preceding equal window.
export function ProgressControls({ active, from, to }: { active: string; from?: string; to?: string }) {
  const router = useRouter();
  const [cFrom, setCFrom] = useState(from ?? "");
  const [cTo, setCTo] = useState(to ?? "");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 5, background: "var(--s1)", border: "1px solid var(--line)", borderRadius: 99, padding: 4 }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => router.push(`/progress?range=${p.key}`)}
            className={"btn " + (active === p.key ? "btn-primary" : "")}
            style={{ padding: "6px 13px", fontSize: 13, color: active === p.key ? "#fff" : "var(--muted)" }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="date" value={cFrom} max={cTo || undefined} onChange={(e) => setCFrom(e.target.value)} className="input" style={{ padding: "7px 10px", fontSize: 13, width: 150 }} />
        <span className="muted" style={{ fontSize: 13 }}>→</span>
        <input type="date" value={cTo} min={cFrom || undefined} onChange={(e) => setCTo(e.target.value)} className="input" style={{ padding: "7px 10px", fontSize: 13, width: 150 }} />
        <button
          className={"btn " + (active === "custom" ? "btn-primary" : "btn-ghost")}
          disabled={!cFrom || !cTo}
          onClick={() => router.push(`/progress?range=custom&from=${cFrom}&to=${cTo}`)}
          style={{ padding: "7px 14px", fontSize: 13 }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
