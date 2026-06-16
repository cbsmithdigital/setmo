import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { resolveAnalyticsRange, type AnalyticsRange } from "@/lib/queries";
import { getGroupAnalytics } from "@/lib/group";
import { StatTile } from "@/components/ui/StatTile";
import { Sparkline, Delta } from "@/components/ui/widgets";
import { Icon } from "@/components/ui/Icon";
import { ScoreOverTime } from "@/components/progress/ProgressCharts";
import { ProgressControls } from "@/components/progress/ProgressControls";
import { SkillMatrix } from "@/components/office/SkillMatrix";
import { fmtMoney } from "@/components/office/OutcomesInsight";
import { getGroupOutcomes, periodForRangeKey } from "@/lib/outcomes";

const PRESETS = [
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "60d", label: "60 days" },
  { key: "3m", label: "3 months" },
  { key: "all", label: "All time" },
];

const STATUS: Record<string, { label: string; color: string }> = {
  top: { label: "Top", color: "#34d399" },
  steady: { label: "Steady", color: "#a78bfa" },
  watch: { label: "Watch", color: "#fbbf24" },
  quiet: { label: "Quiet", color: "#6b7280" },
};

export default async function GroupPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireRole("GROUP_ADMIN", "PLATFORM_ADMIN");
  if (!user.organizationId) {
    return (
      <div className="content">
        <div className="card card-pad muted">No organization is assigned to your account yet.</div>
      </div>
    );
  }

  const sp = await searchParams;
  const { key, range, label } = resolveAnalyticsRange(sp);
  const len = range.to.getTime() - range.from.getTime();
  const prior: AnalyticsRange = { from: new Date(range.from.getTime() - len), to: range.from };
  const g = await getGroupAnalytics(user.organizationId, range, prior);
  const period = periodForRangeKey(key);
  const outcomes = await getGroupOutcomes(user.organizationId, period.label);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <Link className="btn btn-ghost" href="/group" style={{ marginBottom: 12, padding: "7px 14px", fontSize: 13.5 }}>
            ← Portfolio
          </Link>
          <h1>Performance across locations</h1>
          <p>{g.orgName} · {label.toLowerCase()} · {g.activeLocations} of {g.officeCount} locations active</p>
        </div>
        <div className="tb-right">
          <ProgressControls active={key} from={sp.from} to={sp.to} basePath="/group/performance" presets={PRESETS} />
        </div>
      </div>

      <div className="content">
        <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
          <div className="stat-tile">
            <div className="lab">Group average</div>
            <div className="val" style={{ background: "var(--grad-mint)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {g.orgAvg ? g.orgAvg.toFixed(1) : "—"}
            </div>
            <div className="sub" style={{ marginTop: 4 }}>{g.hasPrior ? <Delta v={g.orgDelta} /> : "vs previous period"}</div>
          </div>
          <StatTile lab="Active locations" val={String(g.activeLocations)} sub={`of ${g.officeCount} in group`} />
          <StatTile lab="Active setters" val={String(g.activeSetters)} sub="this period" />
          <StatTile lab="Scored sessions" val={String(g.totalSessions)} sub={label.toLowerCase()} subClass="up" />
        </div>

        <div className="grid g-2" style={{ gridTemplateColumns: "1.5fr 1fr", marginBottom: 18 }}>
          {/* per-location trend lines */}
          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ fontSize: 18 }}>Progress over time</h3>
              <div style={{ display: "flex", gap: "6px 12px", fontSize: 11.5, flexWrap: "wrap", maxWidth: "62%", justifyContent: "flex-end" }} className="muted">
                {g.series.map((s) => (
                  <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 12, height: 3, borderRadius: 9, background: s.color }} />
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
            <ScoreOverTime points={g.points} series={g.series} />
          </div>

          {/* org skills: strengths + gaps */}
          <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
            <h3 style={{ fontSize: 18, marginBottom: 4 }}>Group skills</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Averaged across every location, {label.toLowerCase()}.</p>
            {g.topSkills.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>Not enough scored calls yet.</p>
            ) : (
              <>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--mint)", marginBottom: 6 }}>Strongest</div>
                {g.topSkills.map((s) => (
                  <div key={s.key} className="skill" style={{ padding: "5px 0" }}>
                    <div className="nm" style={{ fontSize: 13 }}>{s.name}</div>
                    <div className="track"><div className="fill mint" style={{ width: (s.avg / 5) * 100 + "%" }} /></div>
                    <div className="sc" style={{ color: "var(--mint)" }}>{s.avg.toFixed(1)}</div>
                  </div>
                ))}
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--amber)", margin: "12px 0 6px" }}>Needs work — central playbook opportunity</div>
                {g.gapSkills.map((s) => (
                  <div key={s.key} className="skill" style={{ padding: "5px 0" }}>
                    <div className="nm" style={{ fontSize: 13 }}>{s.name}</div>
                    <div className="track"><div className="fill" style={{ width: (s.avg / 5) * 100 + "%" }} /></div>
                    <div className="sc" style={{ color: "var(--amber)" }}>{s.avg.toFixed(1)}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* locations table */}
        <div className="card card-pad rise" style={{ animationDelay: ".15s", marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, marginBottom: 10 }}>Locations</h3>
          {g.locations.filter((l) => l.sessions > 0).length === 0 && (
            <p className="muted" style={{ fontSize: 14 }}>No scored calls in this window. Try a wider timeframe.</p>
          )}
          {g.locations
            .filter((l) => l.sessions > 0)
            .map((l, i) => {
              const st = STATUS[l.status];
              const spark = l.trend.filter((x): x is number => x != null);
              return (
                <Link
                  key={l.id}
                  href={`/group/office/${l.id}`}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 6px", borderTop: i ? "1px solid var(--line-soft)" : "none", borderRadius: 8 }}
                >
                  <div style={{ width: 24, textAlign: "center", fontFamily: "var(--font-lato)", fontWeight: 900, color: "var(--muted)" }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{l.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {l.city ? `${l.city} · ` : ""}{l.activeSetters} active · {l.sessions} session{l.sessions === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span className="chip" style={{ padding: "2px 9px", fontSize: 11, color: st.color, borderColor: st.color + "55" }}>{st.label}</span>
                  <Sparkline data={spark.length > 1 ? spark : [l.avg || 0, l.avg || 0]} w={72} h={28} color={st.color} fill={false} />
                  {l.hasPrior ? <Delta v={l.delta} /> : <span className="muted" style={{ fontSize: 12, width: 40, textAlign: "center" }}>—</span>}
                  <div className={"grad-text"} style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 18, width: 40, textAlign: "right" }}>
                    {l.avg ? l.avg.toFixed(1) : "—"}
                  </div>
                  <div style={{ color: "var(--muted)" }}>›</div>
                </Link>
              );
            })}
        </div>

        {/* location × skill heatmap matrix */}
        <div className="card card-pad rise" style={{ animationDelay: ".2s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Icon name="target" size={15} />
            <h3 style={{ fontSize: 18 }}>Skill heatmap by location</h3>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            A warm column across every location points to a group-wide playbook gap; a single warm row is a coaching target.
          </p>
          <SkillMatrix skills={g.matrix.skills} rows={g.matrix.rows} rowLabel="Location" hrefBase="/group/office" />
        </div>

        {/* outcomes & impact by location */}
        <div className="card card-pad rise" style={{ animationDelay: ".25s", marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 18 }}>Outcomes &amp; impact</h3>
            <span className="chip" style={{ padding: "3px 10px", fontSize: 11.5 }}>{period.name}</span>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Set rate &amp; show rate come from practice calls. Production is projected from those rates — each location&apos;s real entered numbers replace its projection.{" "}
            {outcomes.reportedCount > 0
              ? `${outcomes.reportedCount} of ${outcomes.locationCount} locations reported actuals.`
              : "No locations have reported actuals yet."}
          </p>

          {outcomes.rows.length === 0 ? (
            <p className="muted" style={{ fontSize: 13.5 }}>No scored practice calls this month yet.</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
                <div className="stat-tile" style={{ flex: 1, minWidth: 130 }}>
                  <div className="lab">Group set rate</div>
                  <div className="val" style={{ background: "var(--grad-mint)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{outcomes.setRatePct}%</div>
                </div>
                <div className="stat-tile" style={{ flex: 1, minWidth: 130 }}>
                  <div className="lab">Group show rate</div>
                  <div className="val">{outcomes.showRatePct}%</div>
                </div>
                <div className="stat-tile" style={{ flex: 1, minWidth: 130 }}>
                  <div className="lab">Treatment starts</div>
                  <div className="val">{outcomes.totalCases}</div>
                  <div className="sub">portfolio, this month</div>
                </div>
                <div className="stat-tile" style={{ flex: 1, minWidth: 130 }}>
                  <div className="lab">Production</div>
                  <div className="val">{fmtMoney(outcomes.totalProduction)}</div>
                  <div className="sub">reported + projected</div>
                </div>
              </div>

              <div style={{ overflowX: "auto", margin: "0 -4px", padding: "0 4px" }}>
                <div style={{ minWidth: 520 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 80px 80px 90px 1fr", gap: 8, padding: "0 4px 6px", fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--muted)" }}>
                    <div>Location</div>
                    <div style={{ textAlign: "center" }}>Set</div>
                    <div style={{ textAlign: "center" }}>Show</div>
                    <div style={{ textAlign: "center" }}>Cases</div>
                    <div style={{ textAlign: "right" }}>Production</div>
                  </div>
                  {outcomes.rows.map((r, i) => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 80px 80px 90px 1fr", gap: 8, alignItems: "center", padding: "10px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                      <div style={{ textAlign: "center", fontFamily: "var(--font-lato)", fontWeight: 800 }}>{r.setRatePct}%</div>
                      <div style={{ textAlign: "center", fontFamily: "var(--font-lato)", fontWeight: 800 }}>{r.showRatePct}%</div>
                      <div style={{ textAlign: "center", fontFamily: "var(--font-lato)", fontWeight: 800 }}>{r.cases.value}</div>
                      <div style={{ textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 15 }}>{fmtMoney(r.production.value)}</span>
                        {r.anyReported ? (
                          <span className="chip mint" style={{ padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>Actual</span>
                        ) : (
                          <span className="chip" style={{ padding: "1px 7px", fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>Projected</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
