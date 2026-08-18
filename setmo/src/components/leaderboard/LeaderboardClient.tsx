"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

type Row = {
  rank: number;
  name: string;
  sub?: string;
  initials: string;
  score: number;
  movement: number;
  me?: boolean;
  top?: boolean;
};

function MoveBadge({ v }: { v: number }) {
  if (v === 0) return <span className="muted" style={{ fontWeight: 700 }}>—</span>;
  const up = v > 0;
  return (
    <span className={up ? "up" : "down"} style={{ fontWeight: 700, fontSize: 13 }}>
      {up ? "▲" : "▼"} {Math.abs(v)}
    </span>
  );
}

export function LeaderboardClient({
  officeRows,
  globalRows,
  officeName,
  variant = "setter",
}: {
  officeRows: Row[];
  globalRows: Row[];
  officeName: string;
  variant?: "setter" | "agent";
}) {
  const isAgent = variant === "agent";
  const [scope, setScope] = useState<"office" | "global">("office");
  const rows = scope === "office" ? officeRows : globalRows;
  // Agents rank as individuals on BOTH boards (their pod + the whole call
  // center), so "You" applies everywhere. Setters only appear by name on the
  // office board — the global board shows practice standings, not people.
  const showMe = (p: Row) => Boolean(p.me) && (isAgent || scope === "office");
  const subFor = (p: Row) => (scope === "office" && !isAgent ? officeName : p.sub ?? (scope === "office" ? officeName : ""));

  // Tab + copy differ for call-center agents.
  const primaryLabel = isAgent ? "My pod" : "My office";
  const primaryIcon = "team" as const;
  const secondaryLabel = isAgent ? "Whole call center" : "Global · practices";
  const secondaryIcon = "shield" as const;
  const emptyNoun = scope === "office" ? (isAgent ? "agents" : "setters") : isAgent ? "agents" : "practices";
  const footer =
    scope === "global"
      ? isAgent
        ? "Center-wide rankings across every pod — climb by improving your average, not by taking more calls."
        : "Global rankings show practice-level standings only — individual names stay inside each office."
      : "Rankings update after each scored session. Climb by improving, not by grinding volume.";

  // Podium order: 2nd, 1st, 3rd.
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean) as Row[];

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Leaderboard</h1>
          <p>Ranked on improvement and average — not who made the most calls.</p>
        </div>
        <div className="tb-right">
          <span className="chip purple">Implants / full-arch</span>
        </div>
      </div>

      <div className="content">
        <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
          <button className={"btn " + (scope === "office" ? "btn-primary" : "btn-ghost")} onClick={() => setScope("office")}>
            <Icon name={primaryIcon} size={16} /> {primaryLabel}
          </button>
          <button className={"btn " + (scope === "global" ? "btn-primary" : "btn-ghost")} onClick={() => setScope("global")}>
            <Icon name={secondaryIcon} size={16} /> {secondaryLabel}
          </button>
          <div style={{ marginLeft: "auto", alignSelf: "center" }} className="chip">
            <Icon name="shield" size={13} /> Fairness-weighted
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="card card-pad muted" style={{ fontSize: 14 }}>
            No ranked {emptyNoun} yet — scores appear here after sessions are graded.
          </div>
        ) : (
          <>
            {/* podium */}
            {podium.length >= 1 && (
              <div className="grid g-3 rise" style={{ marginBottom: 20, alignItems: "end" }}>
                {podium.map((p) => {
                  const place = p.rank;
                  const tall = place === 1;
                  return (
                    <div
                      key={p.rank}
                      className="card card-pad"
                      style={{
                        textAlign: "center",
                        paddingTop: tall ? 28 : 20,
                        paddingBottom: tall ? 28 : 20,
                        background: tall ? "linear-gradient(160deg,rgba(251,191,36,.14),var(--s2))" : "var(--s2)",
                        borderColor: tall ? "rgba(251,191,36,.4)" : p.me ? "rgba(139,92,246,.4)" : "var(--line)",
                        transform: tall ? "translateY(-8px)" : "none",
                      }}
                    >
                      <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 13, color: place === 1 ? "var(--amber)" : "var(--muted)", marginBottom: 10 }}>
                        {place === 1 ? "🏆 1st" : place === 2 ? "2nd" : "3rd"}
                      </div>
                      <div
                        className="lb-av"
                        style={{ width: tall ? 56 : 46, height: tall ? 56 : 46, fontSize: tall ? 17 : 14, margin: "0 auto 12px", background: place === 1 ? "linear-gradient(135deg,#fbbf24,#f59e0b)" : "var(--grad)" }}
                      >
                        {p.initials}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: tall ? 16 : 14.5 }}>{showMe(p) ? "You" : p.name}</div>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{subFor(p)}</div>
                      <div className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: tall ? 38 : 30 }}>
                        {p.score.toFixed(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* full list */}
            <div className="card card-pad rise" style={{ animationDelay: ".08s" }}>
              <div className="lb">
                {rows.map((p) => (
                  <div key={p.rank} className={"lb-row" + (p.me ? " me" : "") + (p.top ? " top" : "")}>
                    <div className="lb-rank">{p.rank}</div>
                    <div className="lb-av">{p.initials}</div>
                    <div className="lb-nm">
                      {showMe(p) ? "You" : p.name}
                      <small>{subFor(p)}</small>
                    </div>
                    <div className="lb-sc mint-text">{p.score.toFixed(1)}</div>
                    <div className="lb-move">
                      <MoveBadge v={p.movement} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <p className="muted" style={{ fontSize: 13, marginTop: 16, textAlign: "center", display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
          <Icon name="shield" size={14} /> {footer}
        </p>
      </div>
    </>
  );
}
