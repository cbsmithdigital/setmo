import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { resolveAnalyticsRange } from "@/lib/queries";
import { getOfficeSetterDetail } from "@/lib/office";
import { Ring, Delta } from "@/components/ui/widgets";
import { Icon } from "@/components/ui/Icon";
import { ScoreOverTime } from "@/components/progress/ProgressCharts";
import { ProgressControls } from "@/components/progress/ProgressControls";

export default async function SetterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const { id } = await params;
  const sp = await searchParams;
  const { key, range, label } = resolveAnalyticsRange(sp);
  const t = await getOfficeSetterDetail(user.officeId!, id, range);
  if (!t) notFound();

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <Link className="btn btn-ghost" href="/office/team" style={{ marginBottom: 12, padding: "7px 14px", fontSize: 13.5 }}>
            ← Team
          </Link>
          <h1>{t.name}</h1>
          <p>
            Appointment setter · {label.toLowerCase()} · {t.sessions} scored session{t.sessions === 1 ? "" : "s"}
          </p>
        </div>
        <div className="tb-right">
          <ProgressControls active={key} from={sp.from} to={sp.to} basePath={`/office/team/${id}`} />
        </div>
      </div>

      <div className="content">
        {t.sessions === 0 ? (
          <div className="card card-pad muted" style={{ fontSize: 14.5 }}>
            No scored sessions for {t.name.split(" ")[0]} in this window. Try a wider timeframe — calls under a minute aren&apos;t counted.
          </div>
        ) : (
          <>
            <div className="card card-pad card-glow rise" style={{ display: "flex", gap: 30, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
              <Ring value={t.avg} size={132} />
              <div style={{ display: "flex", gap: 36, flexWrap: "wrap" }}>
                <div>
                  <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>vs previous period</div>
                  <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 24 }}>
                    {t.hasPrior ? <Delta v={t.delta} /> : <span className="muted" style={{ fontSize: 15 }}>—</span>}
                  </div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Practice time</div>
                  <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 24 }}>{t.usageHours.toFixed(1)}h</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Sessions</div>
                  <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 24 }}>{t.sessions}</div>
                </div>
                {t.mostImproved && (
                  <div>
                    <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Most improved</div>
                    <div className="chip mint" style={{ marginTop: 4 }}>{t.mostImproved.name} {t.mostImproved.delta >= 0 ? "+" : ""}{t.mostImproved.delta.toFixed(1)}</div>
                  </div>
                )}
                {t.focus && (
                  <div>
                    <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Focus skill</div>
                    <div className="chip purple" style={{ marginTop: 4 }}>{t.focus.name}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid g-2" style={{ gridTemplateColumns: "1.3fr 1fr", marginBottom: 18 }}>
              <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <h3 style={{ fontSize: 18 }}>Score over time</h3>
                  <div style={{ display: "flex", gap: "8px 14px", fontSize: 11.5, flexWrap: "wrap", maxWidth: "60%", justifyContent: "flex-end" }} className="muted">
                    {t.series.map((s) => (
                      <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 12, height: 3, borderRadius: 9, background: s.color }} />
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
                <ScoreOverTime points={t.points} series={t.series} />
              </div>
              <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
                <h3 style={{ fontSize: 18, marginBottom: 4 }}>Skill breakdown</h3>
                <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Averaged across this period.</p>
                {t.snapshot.map((s) => (
                  <div key={s.key} className="skill" style={{ padding: "7px 0" }}>
                    <div className="nm" style={{ width: 150, fontSize: 13.5 }}>
                      <span className={s.tier === "universal" ? "uni" : "spc"} />
                      {s.name}
                    </div>
                    <div className="track">
                      <div className={"fill" + (s.score >= 4.4 ? " mint" : "")} style={{ width: (s.score / 5) * 100 + "%" }} />
                    </div>
                    <div className="sc" style={{ fontSize: 14 }}>{s.score.toFixed(1)}</div>
                  </div>
                ))}
              </div>
            </div>

            {t.recommendation && (
              <div className="card card-pad rise" style={{ animationDelay: ".15s", background: "linear-gradient(150deg,rgba(139,92,246,.14),var(--s2))" }}>
                <div className="chip purple" style={{ marginBottom: 12 }}>
                  <Icon name="target" size={13} /> Current recommendation
                </div>
                <h3 style={{ fontSize: 19, marginBottom: 8 }}>{t.recommendation.training}</h3>
                <p className="muted" style={{ fontSize: 14 }}>
                  SetMo surfaced this because {t.recommendation.reason} — assign the matching training or have them run a
                  focused rep on {t.recommendation.skill.toLowerCase()}.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
