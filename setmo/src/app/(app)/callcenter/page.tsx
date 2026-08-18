import Link from "next/link";
import { requireRole, getActiveRole } from "@/lib/auth";
import { getCallCenterOverview, getFloorOverview, type CallCenterRollup } from "@/lib/callcenter";
import { StatTile } from "@/components/ui/StatTile";
import { Sparkline, Delta } from "@/components/ui/widgets";
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

function NotLinked({ scope }: { scope: string }) {
  return (
    <>
      <div className="topbar"><div className="tb-greet"><h1>Call center</h1></div></div>
      <div className="content"><div className="card card-pad"><p className="muted">Your account isn&apos;t linked to a {scope} yet.</p></div></div>
    </>
  );
}

export default async function CallCenterHome() {
  const user = await requireRole("CALL_CENTER_ADMIN", "CALL_CENTER_MANAGER");
  const senior = getActiveRole(user) === "CALL_CENTER_ADMIN";

  // Floor manager → office-parity pod dashboard.
  if (!senior) {
    if (!user.callCenterPodId) return <NotLinked scope="pod" />;
    const d = await getFloorOverview(user.callCenterPodId);
    if (!d) return <NotLinked scope="pod" />;
    return <FloorHome d={d} />;
  }

  // Senior manager → center-wide overview (all pods).
  const data = user.organizationId ? await getCallCenterOverview(user.organizationId) : null;
  if (!data) return <NotLinked scope="call center" />;
  return <SeniorHome data={data} />;
}

// ---- Floor manager: pod dashboard, office-admin parity ----
function FloorHome({ d }: { d: NonNullable<Awaited<ReturnType<typeof getFloorOverview>>> }) {
  const poolPct = d.pool.purchasedMin ? Math.max(0, Math.min(100, (d.pool.remainingMin / d.pool.purchasedMin) * 100)) : 0;
  const glance = d.team.slice(0, 5);
  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{d.podName}</h1>
          <p>Floor manager · your pod&apos;s agents and the practices they call for.</p>
        </div>
        <div className="tb-right" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="chip" title="Pooled practice balance (managed by your senior manager)">
            <Icon name="card" size={13} /> {(d.pool.remainingMin * 10).toLocaleString()} tokens · ~{d.pool.remainingMin.toLocaleString()} min
          </span>
        </div>
      </div>

      <div className="content">
        <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
          <StatTile lab="Team average" val={d.teamAvg ? d.teamAvg.toFixed(1) : "—"} grad="var(--grad-mint)" sub="across active agents" />
          <StatTile lab="Active agents" val={String(d.activeAgents)} sub={`of ${d.totalAgents}`} />
          <StatTile lab="Sessions this week" val={String(d.sessionsThisWeek)} sub="practice reps" subClass="up" />
          <div className="stat-tile">
            <div className="lab">Pod skills · this month</div>
            {d.topSkills.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>No scored calls yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                <div>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>Strongest</div>
                  {d.topSkills.map((s) => (
                    <div key={s.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span>{s.name}</span><span className="mint-text" style={{ fontWeight: 700 }}>{s.avg.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>Needs work</div>
                  {d.gapSkills.map((s) => (
                    <div key={s.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span>{s.name}</span><span style={{ fontWeight: 700, color: s.avg < 3.6 ? "var(--amber)" : "var(--text)" }}>{s.avg.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid g-2" style={{ gridTemplateColumns: "1.5fr 1fr", marginBottom: 18 }}>
          {/* team at a glance */}
          <div className="card card-pad rise">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 17 }}>Team at a glance</h3>
              <Link className="muted" style={{ fontSize: 13.5, fontWeight: 600 }} href="/callcenter/team">View team →</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {glance.length === 0 && <p className="muted" style={{ fontSize: 14, padding: "8px 0" }}>No agents have practiced yet.</p>}
              {glance.map((t, i) => (
                <Link key={t.id} href={`/callcenter/agent/${t.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                  <div className="lb-av" style={{ width: 38, height: 38, fontSize: 13 }}>{t.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{t.sessions} session{t.sessions === 1 ? "" : "s"} · active {relativeShort(t.lastActive ? new Date(t.lastActive) : null)}</div>
                  </div>
                  <Sparkline data={t.trend.length > 1 ? t.trend : [t.avg || 0, t.avg || 0]} w={56} h={26} color={t.status === "watch" ? "#fbbf24" : t.status === "new" ? "#a78bfa" : "#34d399"} fill={false} />
                  <Delta v={t.delta} />
                  <span className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 18, width: 40, textAlign: "right" }}>{t.avg ? t.avg.toFixed(1) : "—"}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* pool + needs a nudge */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
              <h3 style={{ fontSize: 16, marginBottom: 10 }}>Practice pool</h3>
              <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 30 }} className="grad-text">{(d.pool.remainingMin * 10).toLocaleString()}</div>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>tokens left of {(d.pool.purchasedMin * 10).toLocaleString()}</div>
              <div style={{ height: 8, borderRadius: 99, background: "var(--s3)", overflow: "hidden" }}>
                <div style={{ width: `${poolPct}%`, height: "100%", borderRadius: 99, background: "var(--grad-mint)" }} />
              </div>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Shared across the whole call center · managed by your senior manager.</p>
            </div>

            <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>Needs a nudge</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {d.attention.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>Everyone&apos;s on track. 🎉</p>}
                {d.attention.slice(0, 5).map((t) => (
                  <Link key={t.id} href={`/callcenter/agent/${t.id}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="lb-av" style={{ width: 32, height: 32, fontSize: 12 }}>{t.initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.name}</div>
                      <div className="muted" style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.rec ?? (t.status === "new" ? `New — only ${t.usageHours.toFixed(1)}h practiced` : "Below pod average")}</div>
                    </div>
                    <span className={"chip " + (t.status === "new" ? "purple" : "amber")} style={{ fontSize: 11 }}>{t.status === "new" ? "New" : "Watch"}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid g-2" style={{ gridTemplateColumns: "1.35fr .65fr" }}>
          {/* served offices */}
          <div className="card card-pad rise" style={{ animationDelay: ".15s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ fontSize: 17 }}>Accounts</h3>
              <Link className="muted" style={{ fontSize: 13, fontWeight: 600 }} href="/callcenter/accounts">Details →</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {d.offices.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{o.name}{o.city ? <span className="muted" style={{ fontWeight: 400 }}> · {o.city}</span> : null}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{o.agents} agent{o.agents === 1 ? "" : "s"} · {o.sessions} reps</div>
                  </div>
                  {scoreChip(o.avg)}
                </div>
              ))}
              {d.offices.length === 0 && <p className="muted" style={{ fontSize: 13.5, paddingTop: 10 }}>No served offices yet.</p>}
            </div>
          </div>

          {/* skill heatmap */}
          <div className="card card-pad rise" style={{ animationDelay: ".2s" }}>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Skill heatmap</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Across all your agents — a skill low everywhere is a coaching-playbook gap.</p>
            <Heatmap heatmap={d.heatmap} />
          </div>
        </div>
      </div>
    </>
  );
}

// ---- Senior manager: whole call center (all pods) ----
function SeniorHome({ data }: { data: Awaited<ReturnType<typeof getCallCenterOverview>> }) {
  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{data.name}</h1>
          <p>Senior manager — all pods, agents, and served offices</p>
        </div>
        <div className="tb-right" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link className="btn btn-ghost" href="/callcenter/manage" style={{ padding: "6px 12px", fontSize: 13 }}><Icon name="team" size={14} /> Manage</Link>
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

        {data.pods.length > 0 && (
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
          <div className="card card-pad rise">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 17 }}>Agents</h3>
              <Link className="muted" style={{ fontSize: 13, fontWeight: 600 }} href="/callcenter/team">View team →</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {data.agents.map((a) => (
                <Link key={a.id} href={`/callcenter/agent/${a.id}`} className="cc-agent-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}{a.podName ? <span className="muted" style={{ fontWeight: 400 }}> · {a.podName}</span> : null}</div>
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

          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Skill heatmap</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Across all agents and pods — a skill low everywhere is a coaching-playbook gap.</p>
            <Heatmap heatmap={data.heatmap} />
          </div>
        </div>

        <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <h3 style={{ fontSize: 17 }}>Served offices</h3>
            <Link className="muted" style={{ fontSize: 13, fontWeight: 600 }} href="/callcenter/accounts">Accounts →</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.offices.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{o.name}{o.city ? <span className="muted" style={{ fontWeight: 400 }}> · {o.city}</span> : null}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{o.podName ? `${o.podName} · ` : ""}{o.agents} agent{o.agents === 1 ? "" : "s"} · {o.sessions} reps</div>
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
