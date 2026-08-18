import Link from "next/link";
import { getAgentHome, getAgentDetail } from "@/lib/callcenter";
import { getSetterOnboarding } from "@/lib/queries";
import { listGoalsForSetter } from "@/lib/goals";
import { Ring, Delta, AllowanceMeter } from "@/components/ui/widgets";
import { StatTile } from "@/components/ui/StatTile";
import { Icon } from "@/components/ui/Icon";
import { OnboardingChecklist } from "@/components/office/OnboardingChecklist";
import { SetterGoals } from "@/components/goals/SetterGoals";
import { greeting, whenLabel, mmss } from "@/lib/format";

// A call-center phone agent's home — full parity with the setter dashboard, but
// pooled allowance, pod ranking, and stats aggregated across the offices they
// call for. (Agents have no single officeId.)
export async function AgentHome({ userId, first }: { userId: string; first: string }) {
  const d = await getAgentHome(userId);
  if (!d) {
    return (
      <>
        <div className="topbar">
          <div className="tb-greet"><h1>{greeting()}, {first} 👋</h1></div>
          <div className="tb-right"><Link className="btn btn-primary" href="/practice"><Icon name="mic" /> Start practice</Link></div>
        </div>
        <div className="content"><div className="card card-pad"><p className="muted">Run your first practice call to see your stats here.</p></div></div>
      </>
    );
  }
  const [detail, goals, onboarding] = await Promise.all([
    getAgentDetail(userId),
    listGoalsForSetter(userId),
    getSetterOnboarding(userId),
  ]);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{greeting()}, {d.firstName} 👋</h1>
          <p>{d.podName} · practicing for the practices you call for. Every rep sharpens the real thing.</p>
        </div>
        <div className="tb-right" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href="/practice"><Icon name="mic" /> Start practice</Link>
          <AllowanceMeter remainingMin={d.allowance.remainingMin} purchasedMin={d.allowance.purchasedMin} usedMin={d.allowance.usedMin} />
        </div>
      </div>

      <div className="content">
        <OnboardingChecklist data={onboarding} title="Get started" subtitle="A few reps to get rolling. This disappears once you're going." />

        {/* goals + ring */}
        <div className="grid g-2 rise" style={{ gridTemplateColumns: "1.5fr 1fr", marginBottom: 18 }}>
          <SetterGoals goals={goals} compact />
          <div className="card card-pad" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <div className="eyebrow">Skill level · this month</div>
            <Ring value={d.avg} size={150} label="month avg" />
            {d.avgDelta !== 0 && <div className="chip mint"><Delta v={d.avgDelta} /> vs last month</div>}
          </div>
        </div>

        {/* stat row */}
        <div className="grid g-4 rise" style={{ marginBottom: 18, animationDelay: ".05s" }}>
          <StatTile lab="Sessions this week" val={String(d.sessionsThisWeek)} sub="Keep the streak alive" subClass="up" />
          <StatTile lab="Best skill" val={d.best ? d.best.score.toFixed(1) : "—"} grad="var(--grad-mint)" sub={d.best?.name} />
          <StatTile lab="Focus area" val={d.focus ? d.focus.score.toFixed(1) : "—"} grad="linear-gradient(135deg,#fbbf24,#f59e0b)" sub={d.focus?.name} />
          <StatTile lab="Pod rank" val={d.myRank ? `#${d.myRank}` : "—"} sub={`of ${d.podCount} in ${d.podName}`} subClass="up" />
        </div>

        <div className="grid g-2" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
          {/* recent sessions */}
          <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 18 }}>Recent sessions</h3>
              <Link className="muted" style={{ fontSize: 13.5, fontWeight: 600 }} href="/progress">View all →</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {d.recent.length === 0 && <p className="muted" style={{ fontSize: 14, padding: "8px 0" }}>No sessions yet — run your first rep to see it here.</p>}
              {d.recent.map((s, i) => (
                <Link key={s.id} href={`/results/${s.id}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 8px", borderRadius: 10, borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--s3)", display: "grid", placeItems: "center", color: "var(--purple-2)", flex: "none" }}><Icon name="mic" size={18} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.persona}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{s.officeName ? `${s.officeName} · ` : ""}{whenLabel(s.when)} · {mmss(s.durationSeconds)}</div>
                  </div>
                  <Delta v={s.delta} />
                  <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 19, width: 44, textAlign: "right" }} className={s.score >= 4 ? "mint-text" : "grad-text"}>{s.score.toFixed(1)}</div>
                </Link>
              ))}
            </div>
          </div>

          {/* pod leaderboard peek + recommendation */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card card-pad rise" style={{ animationDelay: ".15s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: 18 }}>Pod leaderboard</h3>
                <Link className="muted" style={{ fontSize: 13.5, fontWeight: 600 }} href="/leaderboard">Full board →</Link>
              </div>
              <div className="lb">
                {d.leaderboard.map((p) => (
                  <div key={p.rank} className={"lb-row" + (p.me ? " me" : "") + (p.top ? " top" : "")} style={{ padding: "9px 12px" }}>
                    <div className="lb-rank">{p.rank}</div>
                    <div className="lb-av" style={{ width: 32, height: 32, fontSize: 12 }}>{p.initials}</div>
                    <div className="lb-nm" style={{ fontSize: 14 }}>{p.me ? "You" : p.name}</div>
                    <div className="lb-sc mint-text" style={{ fontSize: 17, width: 40 }}>{p.score ? p.score.toFixed(1) : "—"}</div>
                  </div>
                ))}
                {d.leaderboard.length === 0 && <p className="muted" style={{ fontSize: 13.5, padding: "4px 12px" }}>No ranking yet.</p>}
              </div>
            </div>

            {d.recommendation && (
              <div className="card card-pad rise" style={{ animationDelay: ".2s", background: "linear-gradient(150deg,rgba(139,92,246,.16),var(--s2))" }}>
                <div className="chip purple" style={{ marginBottom: 12 }}><Icon name="target" size={13} /> Recommended for you</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{d.recommendation.training}</div>
                <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>Because {d.recommendation.why}.</p>
                <Link className="btn btn-ghost" style={{ width: "100%" }} href="/trainings">Start {d.recommendation.mins}-min training</Link>
              </div>
            )}
          </div>
        </div>

        {/* per-account breakdown (agents span offices) */}
        {detail && detail.perOffice.length > 0 && (
          <div className="card card-pad rise" style={{ marginTop: 18, animationDelay: ".25s" }}>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Your accounts</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>How you&apos;re doing on each practice you call for.</p>
            <div className="grid g-3">
              {detail.perOffice.map((o) => (
                <div key={o.officeId} className="card card-pad" style={{ background: "var(--s2)" }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{o.officeName}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span className="grad-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 26 }}>{o.avg ? o.avg.toFixed(1) : "—"}</span>
                    <span className="muted" style={{ fontSize: 12 }}>avg · {o.sessions} reps</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
