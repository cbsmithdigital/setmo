import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOfficeOverview } from "@/lib/office";
import { canAccessGroupOffice } from "@/lib/group";
import { StatTile } from "@/components/ui/StatTile";
import { Sparkline, Delta } from "@/components/ui/widgets";

function trendColor(status: string) {
  return status === "watch" ? "#fbbf24" : status === "new" ? "#a78bfa" : "#34d399";
}

export default async function GroupOfficePage({ params }: { params: Promise<{ officeId: string }> }) {
  const user = await requireRole("GROUP_ADMIN", "MULTI_PRACTICE_ADMIN", "PLATFORM_ADMIN");
  const { officeId } = await params;

  // Must be an office this leader oversees (their org, and within a Multi Practice
  // Admin's assigned subset).
  if (!(await canAccessGroupOffice(user, officeId))) notFound();
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { id: true, name: true, city: true } });
  if (!office) notFound();

  const o = await getOfficeOverview(officeId);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <Link className="btn btn-ghost" href="/group" style={{ marginBottom: 12, padding: "7px 14px", fontSize: 13.5 }}>
            ← Portfolio
          </Link>
          <h1>{office!.name}</h1>
          <p>{office!.city ? `${office!.city} · ` : ""}this month · {o.activeSetters} active setter{o.activeSetters === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="content">
        <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
          <StatTile lab="Team average" val={o.teamAvg.toFixed(1)} grad="var(--grad-mint)" sub="this month" />
          <StatTile lab="Active setters" val={String(o.activeSetters)} sub={`of ${o.seats} seats`} />
          <StatTile lab="Sessions this week" val={String(o.sessionsThisWeek)} sub="office-wide" subClass="up" />
          <div className="stat-tile">
            <div className="lab">Office skills · this month</div>
            {o.skills.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>No scored calls yet</div>
            ) : (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--mint)", marginBottom: 4 }}>Strongest</div>
                  {o.topSkills.map((s) => (
                    <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
                      <span style={{ color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                      <b className="mint-text" style={{ fontFamily: "var(--font-lato)" }}>{s.avg.toFixed(1)}</b>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--amber)", marginBottom: 4 }}>Needs work</div>
                  {o.gapSkills.map((s) => (
                    <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
                      <span style={{ color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                      <b style={{ fontFamily: "var(--font-lato)", color: "var(--amber)" }}>{s.avg.toFixed(1)}</b>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
          <h3 style={{ fontSize: 18, marginBottom: 10 }}>Setters</h3>
          {o.team.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No setters yet.</p>}
          {o.team.map((t, i) => (
            <Link
              key={t.id}
              href={`/group/office/${officeId}/setter/${t.id}`}
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 6px", borderTop: i ? "1px solid var(--line-soft)" : "none", borderRadius: 8 }}
            >
              <div className="lb-av" style={{ width: 36, height: 36, fontSize: 13 }}>{t.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{t.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{t.sessions} session{t.sessions === 1 ? "" : "s"} this month{t.recSkill ? ` · focus: ${t.recSkill}` : ""}</div>
              </div>
              <Sparkline data={t.trend.length > 1 ? t.trend : [t.avg || 0, t.avg || 0]} w={72} h={28} color={trendColor(t.status)} fill={false} />
              <Delta v={t.delta} />
              <div className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 18, width: 38, textAlign: "right" }}>
                {t.avg ? t.avg.toFixed(1) : "—"}
              </div>
              <div style={{ color: "var(--muted)" }}>›</div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
