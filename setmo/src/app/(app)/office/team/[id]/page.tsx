import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getOfficeSetterDetail } from "@/lib/office";
import { Ring, Delta } from "@/components/ui/widgets";
import { Icon } from "@/components/ui/Icon";
import { ScoreOverTime } from "@/components/progress/ProgressCharts";

export default async function SetterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const { id } = await params;
  const t = await getOfficeSetterDetail(user.officeId!, id);
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
            Appointment setter · {t.sessions} session{t.sessions === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="content">
        <div className="card card-pad card-glow rise" style={{ display: "flex", gap: 30, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
          <Ring value={t.avg} size={132} />
          <div style={{ display: "flex", gap: 36, flexWrap: "wrap" }}>
            <div>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Trend</div>
              <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 24 }}>
                <Delta v={t.delta} />
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
            <h3 style={{ fontSize: 18, marginBottom: 18 }}>Score over time</h3>
            <ScoreOverTime points={t.points} />
          </div>
          <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
            <h3 style={{ fontSize: 18, marginBottom: 14 }}>Skill breakdown</h3>
            {t.snapshot.length === 0 ? (
              <p className="muted" style={{ fontSize: 14 }}>No scored sessions yet.</p>
            ) : (
              t.snapshot.map((s) => (
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
              ))
            )}
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
      </div>
    </>
  );
}
