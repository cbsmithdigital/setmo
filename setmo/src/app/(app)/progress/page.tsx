import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSetterProgress, resolveAnalyticsRange } from "@/lib/queries";
import { StatTile } from "@/components/ui/StatTile";
import { Sparkline, Delta } from "@/components/ui/widgets";
import { Icon } from "@/components/ui/Icon";
import { whenLabel, mmss } from "@/lib/format";
import { showRateColor } from "@/lib/audit";
import { ScoreOverTime, UniversalRadar } from "@/components/progress/ProgressCharts";
import { ProgressControls } from "@/components/progress/ProgressControls";

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const { key, range, label } = resolveAnalyticsRange(sp);
  const d = await getSetterProgress(user.id, user.officeId, range);
  const { stats } = d;

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Your progress</h1>
          <p>
            {label.toLowerCase()} · {stats.totalReps} scored session{stats.totalReps === 1 ? "" : "s"}
            {stats.hasPrior ? " · compared to the previous period" : ""}.
          </p>
        </div>
        <div className="tb-right">
          <ProgressControls active={key} from={sp.from} to={sp.to} />
        </div>
      </div>

      <div className="content">
        {stats.totalReps === 0 ? (
          <div className="card card-pad muted" style={{ fontSize: 14.5 }}>
            No scored sessions in this window. Try a wider timeframe, or run a rep — calls under a minute aren&apos;t counted.
          </div>
        ) : (
          <>
            <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
              <StatTile
                lab="Overall average"
                val={stats.overallAvg.toFixed(1)}
                grad="var(--grad-mint)"
                sub={stats.hasPrior ? `${stats.overallDelta >= 0 ? "▲" : "▼"} ${Math.abs(stats.overallDelta).toFixed(1)} vs previous period` : "across this period"}
                subClass={stats.overallDelta >= 0 ? "up" : "down"}
              />
              <StatTile
                lab="Most improved"
                val={stats.mostImproved ? `${stats.mostImproved.delta >= 0 ? "+" : ""}${stats.mostImproved.delta.toFixed(1)}` : "—"}
                grad="var(--grad-num)"
                sub={stats.mostImproved ? `${stats.mostImproved.name} vs previous period` : "Need a prior period"}
              />
              <StatTile lab="Sessions" val={String(stats.totalReps)} sub={`${stats.repsThisWeek} this week`} subClass="up" />
              <StatTile lab="Practice time" val={`${stats.practiceHours.toFixed(1)}h`} sub="in this period" />
            </div>

            <div className="grid g-2" style={{ gridTemplateColumns: "1.4fr 1fr", marginBottom: 18 }}>
              <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
                  <h3 style={{ fontSize: 18 }}>Score over time</h3>
                  <div style={{ display: "flex", gap: 16, fontSize: 12.5, flexWrap: "wrap" }} className="muted">
                    {d.series.map((s) => (
                      <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 14, height: 3, borderRadius: 9, background: s.color }} />
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
                <ScoreOverTime points={d.points} series={d.series} />
              </div>
              <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
                <h3 style={{ fontSize: 18, marginBottom: 4 }}>Universal skill profile</h3>
                <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                  Averaged across this period.
                </p>
                <UniversalRadar data={d.universal} />
              </div>
            </div>

            <div className="card card-pad rise" style={{ animationDelay: ".15s" }}>
              <h3 style={{ fontSize: 18, marginBottom: 16 }}>Every skill, this period</h3>
              <div className="grid g-2" style={{ gap: "4px 40px" }}>
                {d.snapshot.map((s, i) => (
                  <div
                    key={s.key}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 0", borderTop: i > 1 ? "1px solid var(--line-soft)" : "none" }}
                  >
                    <span
                      style={{ width: 7, height: 7, borderRadius: 9, flex: "none", background: s.tier === "universal" ? "var(--purple)" : "var(--mint)" }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{s.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {s.tier === "universal" ? "Universal" : "Implant-specific"}
                      </div>
                    </div>
                    <Sparkline data={s.spark.length > 1 ? s.spark : [s.score, s.score]} w={70} h={28} color={s.delta >= 0 ? "#34d399" : "#fb7185"} fill={false} />
                    <Delta v={s.delta} />
                    <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 20, width: 42, textAlign: "right" }} className={s.score >= 4.4 ? "mint-text" : "grad-text"}>
                      {s.score.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* all sessions this period — click into any call's details */}
            <div className="card card-pad rise" style={{ marginTop: 18, animationDelay: ".2s" }}>
              <h3 style={{ fontSize: 18, marginBottom: 4 }}>Sessions</h3>
              <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Every scored call in this period — click any to see its full breakdown.
              </p>

              {/* column header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 8px 10px", borderBottom: "1px solid var(--line)", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
                <div style={{ width: 42, flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>Session</div>
                <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
                  <span style={{ width: 64, textAlign: "center" }}>Show rate</span>
                  <span style={{ width: 56, textAlign: "center" }}>Trend</span>
                  <span style={{ width: 48, textAlign: "right" }}>Score</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {d.sessions.map((s, i) => {
                  const c = showRateColor(s.showRate);
                  return (
                    <Link
                      key={s.id}
                      href={`/results/${s.id}`}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 8px", borderRadius: 10, borderTop: i ? "1px solid var(--line-soft)" : "none" }}
                    >
                      <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--s3)", display: "grid", placeItems: "center", color: "var(--purple-2)", flex: "none" }}>
                        <Icon name="mic" size={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.persona}</div>
                        <div className="muted" style={{ fontSize: 12.5 }}>{whenLabel(s.when)} · {mmss(s.durationSeconds)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
                        <span style={{ width: 64, display: "flex", justifyContent: "center" }}>
                          <span className="chip" style={{ display: "inline-flex", justifyContent: "center", width: 52, padding: "2px 0", fontSize: 11.5, fontWeight: 700, background: c.bg, color: c.fg, border: "none" }} title="Likely show rate">{s.showRate}%</span>
                        </span>
                        <div style={{ width: 56, display: "flex", justifyContent: "center" }}><Delta v={s.delta} /></div>
                        <div style={{ width: 48, textAlign: "right", fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 19 }} className={s.score >= 4 ? "mint-text" : "grad-text"}>
                          {s.score.toFixed(1)}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
