"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkline, Delta } from "@/components/ui/widgets";
import { relativeShort } from "@/lib/format";

type Row = {
  id: string;
  name: string;
  initials: string;
  avg: number;
  delta: number;
  usageHours: number;
  sessions: number;
  lastActive: Date | string | null;
  trend: number[];
  recSkill: string | null;
  status: string;
};

function trendColor(status: string) {
  return status === "watch" ? "#fbbf24" : status === "new" ? "#a78bfa" : "#34d399";
}

// Reused by the office team page (setters) and the call-center floor-manager team
// page (agents) — `hrefBase`/`noun` retarget the row links + labels.
export function TeamTable({ rows, hrefBase = "/office/team", noun = "setter" }: { rows: Row[]; hrefBase?: string; noun?: string }) {
  const nounCap = noun.charAt(0).toUpperCase() + noun.slice(1);
  const FILTERS: [string, string][] = [
    ["all", `All ${noun}s`],
    ["rising", "Rising"],
    ["attention", "Needs attention"],
  ];
  const [filter, setFilter] = useState("all");
  const filtered = rows.filter((t) =>
    filter === "all"
      ? true
      : filter === "rising"
        ? t.status === "rising" || t.status === "top"
        : t.status === "watch" || t.status === "new"
  );

  const cols = "2fr 1.3fr 1fr 1.3fr 1.6fr 30px";

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {FILTERS.map(([k, l]) => (
          <button key={k} className={"btn " + (filter === k ? "btn-primary" : "btn-ghost")} style={{ padding: "9px 16px", fontSize: 14 }} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>

      <div className="card rise" style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 680 }}>
        <div
          style={{ display: "grid", gridTemplateColumns: cols, gap: 16, padding: "14px 22px", borderBottom: "1px solid var(--line)", fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}
        >
          <div>{nounCap}</div>
          <div>Usage</div>
          <div>Sessions</div>
          <div>Avg score</div>
          <div>Coach next</div>
          <div />
        </div>

        {filtered.length === 0 && <div className="card-pad muted" style={{ fontSize: 14 }}>No {noun}s in this view.</div>}

        {filtered.map((t, i) => (
          <Link
            key={t.id}
            href={`${hrefBase}/${t.id}`}
            style={{ display: "grid", gridTemplateColumns: cols, gap: 16, alignItems: "center", padding: "15px 22px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <div className="lb-av" style={{ width: 38, height: 38, fontSize: 13 }}>{t.initials}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{t.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>Active {relativeShort(t.lastActive ? new Date(t.lastActive) : null)}</div>
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 99, background: "#181828", overflow: "hidden", maxWidth: 90 }}>
                  <div style={{ height: "100%", width: Math.min(100, (t.usageHours / 3) * 100) + "%", background: "var(--grad)", borderRadius: 99 }} />
                </div>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t.usageHours.toFixed(1)}h used</div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t.sessions}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Sparkline data={t.trend.length > 1 ? t.trend : [t.avg || 0, t.avg || 0]} w={56} h={26} color={trendColor(t.status)} fill={false} />
              <span className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 18 }}>{t.avg ? t.avg.toFixed(1) : "—"}</span>
              <Delta v={t.delta} />
            </div>
            <div>{t.recSkill ? <span className="chip purple" style={{ padding: "4px 10px", fontSize: 12 }}>{t.recSkill}</span> : <span className="muted" style={{ fontSize: 12.5 }}>—</span>}</div>
            <div style={{ color: "var(--muted)" }}>›</div>
          </Link>
        ))}
        </div>
      </div>
    </>
  );
}
