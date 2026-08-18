import Link from "next/link";
import { requireRole, getActiveRole } from "@/lib/auth";
import { getCallCenterOverview, getPodOverview, type CallCenterRollup } from "@/lib/callcenter";
import { StatTile } from "@/components/ui/StatTile";
import { Icon } from "@/components/ui/Icon";
import { relativeShort } from "@/lib/format";

function scoreChip(v: number) {
  const cls = v >= 4.3 ? "mint" : v < 3.7 ? "amber" : "";
  return <span className={"chip " + cls} style={{ padding: "2px 9px", fontFamily: "var(--font-lato)", fontWeight: 800 }}>{v ? v.toFixed(1) : "—"}</span>;
}

function Heatmap({ heatmap }: { heatmap: CallCenterRollup["heatmap"] }) {
  const rows = [...heatmap].sort((a, b) => a.avg - b.avg);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((h) => {
        const low = h.avg < 3.6;
        return (
          <div key={h.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 150, fontSize: 13, color: "var(--text-2)" }}>{h.name}</div>
            <div style={{ flex: 1, height: 8, borderRadius: 99, background: "var(--s3)", overflow: "hidden" }}>
              <div style={{ width: `${(h.avg / 5) * 100}%`, height: "100%", borderRadius: 99, background: low ? "var(--amber)" : "var(--grad-mint)" }} />
            </div>
            <div style={{ width: 34, textAlign: "right", fontSize: 13, fontWeight: 700, color: low ? "var(--amber)" : "var(--text)" }}>{h.avg.toFixed(1)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default async function CallCenterHome() {
  const user = await requireRole("CALL_CENTER_ADMIN", "CALL_CENTER_MANAGER");
  const senior = getActiveRole(user) === "CALL_CENTER_ADMIN";

  const data = senior
    ? (user.organizationId ? await getCallCenterOverview(user.organizationId) : null)
    : (user.callCenterPodId ? await getPodOverview(user.callCenterPodId) : null);

  if (!data) {
    return (
      <>
        <div className="topbar"><div className="tb-greet"><h1>Call center</h1></div></div>
        <div className="content"><div className="card card-pad"><p className="muted">Your account isn&apos;t linked to a {senior ? "call center" : "pod"} yet.</p></div></div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{data.name}</h1>
          <p>{senior ? "Senior manager — all pods, agents, and served offices" : "Floor manager — your pod's agents and accounts"}</p>
        </div>
        <div className="tb-right" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {senior && <Link className="btn btn-ghost" href="/callcenter/manage" style={{ padding: "6px 12px", fontSize: 13 }}><Icon name="team" size={14} /> Manage</Link>}
          <span className="chip" title="Pooled practice balance">
            <Icon name="card" size={13} /> {(data.pool.remainingMin * 10).toLocaleString()} tokens · ~{data.pool.remainingMin.toLocaleString()} min
          </span>
        </div>
      </div>

      <div className="content">
        <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
          <StatTile lab="Team average" val={data.ccAvg ? data.ccAvg.toFixed(1) : "—"} grad="var(--grad-mint)" sub="across active agents" />
          <StatTile lab="Active agents" val={String(data.activeAgents)} sub={`of ${data.totalAgents}`} />
          <StatTile lab="Served offices" val={String(data.offices.length)} sub="practices you call for" />
          <StatTile lab="Sessions this week" val={String(data.sessionsThisWeek)} sub="practice reps" subClass="up" />
        </div>

        {senior && data.pods.length > 0 && (
          <div className="grid g-2 rise" style={{ marginBottom: 18 }}>
            {data.pods.map((p) => (
              <div key={p.id} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: 16, marginBottom: 3 }}>{p.name}</h3>
                  <p className="muted" style={{ fontSize: 13 }}>{p.agents} agents · {p.offices} offices · {p.sessions} sessions</p>
                </div>
                {scoreChip(p.avg)}
              </div>
            ))}
          </div>
        )}

        <div className="grid g-2" style={{ gridTemplateColumns: "1.35fr .65fr", marginBottom: 18 }}>
          {/* agent roster */}
          <div className="card card-pad rise">
            <h3 style={{ fontSize: 17, marginBottom: 12 }}>Agents</h3>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {data.agents.map((a) => (
                <Link key={a.id} href={`/callcenter/agent/${a.id}`} className="cc-agent-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}{senior && a.podName ? <span className="muted" style={{ fontWeight: 400 }}> · {a.podName}</span> : null}</div>
                    <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.officeCount} office{a.officeCount === 1 ? "" : "s"} · {a.sessions} reps · {a.trainingMin}m
                      {a.weakSkill ? ` · focus: ${a.weakSkill}` : ""}
                    </div>
                  </div>
                  <span className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{a.last ? relativeShort(a.last) : "—"}</span>
                  {scoreChip(a.overall)}
                  <Icon name="arrow" size={14} />
                </Link>
              ))}
              {data.agents.length === 0 && <p className="muted" style={{ fontSize: 13.5, paddingTop: 10 }}>No agents yet.</p>}
            </div>
          </div>

          {/* skill heatmap */}
          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Skill heatmap</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Across all agents{senior ? " and pods" : ""} — a skill low everywhere is a coaching-playbook gap.</p>
            <Heatmap heatmap={data.heatmap} />
          </div>
        </div>

        {/* served offices */}
        <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <h3 style={{ fontSize: 17 }}>Served offices</h3>
            <span className="muted" style={{ fontSize: 12.5 }}>Practices your agents call for</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.offices.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{o.name}{o.city ? <span className="muted" style={{ fontWeight: 400 }}> · {o.city}</span> : null}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{senior && o.podName ? `${o.podName} · ` : ""}{o.agents} agent{o.agents === 1 ? "" : "s"} · {o.sessions} reps</div>
                </div>
                {scoreChip(o.avg)}
              </div>
            ))}
            {data.offices.length === 0 && <p className="muted" style={{ fontSize: 13.5, paddingTop: 10 }}>No served offices yet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
