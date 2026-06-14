import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getGroupOverview } from "@/lib/group";
import { StatTile } from "@/components/ui/StatTile";
import { Icon } from "@/components/ui/Icon";

const STATUS: Record<string, { label: string; color: string }> = {
  top: { label: "Top", color: "#34d399" },
  steady: { label: "Steady", color: "#a78bfa" },
  watch: { label: "Watch", color: "#fbbf24" },
  quiet: { label: "Quiet", color: "#6b7280" },
};

export default async function GroupPage() {
  const user = await requireRole("GROUP_ADMIN", "PLATFORM_ADMIN");
  if (!user.organizationId) {
    return (
      <div className="content">
        <div className="card card-pad muted">No organization is assigned to your account yet.</div>
      </div>
    );
  }
  const g = await getGroupOverview(user.organizationId);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{g.orgName}</h1>
          <p>{g.officeCount} practices · portfolio performance</p>
        </div>
        <div className="tb-right">
          <Link className="btn btn-primary" href="/coach">
            <Icon name="chat" /> Ask your strategist
          </Link>
        </div>
      </div>

      <div className="content">
        <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
          <StatTile lab="Group average" val={g.orgAvg.toFixed(1)} grad="var(--grad-mint)" sub="across active practices" />
          <StatTile lab="Practices" val={String(g.officeCount)} sub="in this group" />
          <StatTile lab="Active setters" val={String(g.totalActiveSetters)} sub="group-wide" />
          <StatTile lab="Sessions this week" val={String(g.sessionsThisWeek)} subClass="up" sub="group-wide" />
        </div>

        <div className="grid g-2" style={{ gridTemplateColumns: "1.5fr 1fr", marginBottom: 18 }}>
          {/* practices ranked */}
          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <h3 style={{ fontSize: 18, marginBottom: 10 }}>Practices, ranked</h3>
            {g.offices.map((o, i) => {
              const st = STATUS[o.status];
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                  <div style={{ width: 26, textAlign: "center", fontFamily: "var(--font-lato)", fontWeight: 900, color: "var(--muted)" }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{o.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {o.city ? `${o.city} · ` : ""}{o.activeSetters} active · {o.sessions} sessions
                    </div>
                  </div>
                  <span className="chip" style={{ padding: "2px 9px", fontSize: 11, color: st.color, borderColor: st.color + "55" }}>{st.label}</span>
                  <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 18, width: 40, textAlign: "right" }} className={o.teamAvg >= 4.5 ? "mint-text" : "grad-text"}>
                    {o.teamAvg ? o.teamAvg.toFixed(1) : "—"}
                  </div>
                </div>
              );
            })}
            {g.offices.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No practices yet.</p>}
          </div>

          {/* heatmap + top performers */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
              <h3 style={{ fontSize: 17, marginBottom: 4 }}>Skill heatmap</h3>
              <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Group-wide — low everywhere signals a central playbook gap.</p>
              {g.heatmap.map((h) => {
                const low = h.avg < 3.7;
                return (
                  <div key={h.name} className="skill" style={{ padding: "6px 0" }}>
                    <div className="nm" style={{ fontSize: 13 }}>{h.name}</div>
                    <div className="track">
                      <div className={"fill" + (h.avg >= 4.4 ? " mint" : "")} style={{ width: (h.avg / 5) * 100 + "%" }} />
                    </div>
                    <div className="sc" style={{ color: low ? "var(--amber)" : h.avg >= 4.4 ? "var(--mint)" : "#fff" }}>{h.avg.toFixed(1)}</div>
                  </div>
                );
              })}
              {g.heatmap.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Not enough data yet.</p>}
            </div>

            <div className="card card-pad rise" style={{ animationDelay: ".15s" }}>
              <h3 style={{ fontSize: 17, marginBottom: 12 }}>Top performers</h3>
              {g.topPerformers.map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: i < g.topPerformers.length - 1 ? 10 : 0 }}>
                  <div style={{ width: 18, fontWeight: 800, color: "var(--muted)", fontSize: 13 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{t.office}</div>
                  </div>
                  <div className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 16 }}>{t.avg.toFixed(1)}</div>
                </div>
              ))}
              {g.topPerformers.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Not enough data yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
