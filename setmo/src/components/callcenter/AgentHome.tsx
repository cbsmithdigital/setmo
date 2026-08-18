import Link from "next/link";
import { getAgentDetail } from "@/lib/callcenter";
import { Ring } from "@/components/ui/widgets";
import { Icon } from "@/components/ui/Icon";
import { greeting, relativeShort } from "@/lib/format";

// A call-center phone agent's own home: their overall + per-account breakdown +
// recent calls, with a Start-practice CTA. (Agents span many offices, so this is
// their aggregate view — distinct from a single-office setter's dashboard.)
export async function AgentHome({ userId, first }: { userId: string; first: string }) {
  const a = await getAgentDetail(userId);
  if (!a) {
    return (
      <>
        <div className="topbar"><div className="tb-greet"><h1>{greeting()}, {first} 👋</h1></div>
          <div className="tb-right"><Link className="btn btn-primary" href="/practice"><Icon name="mic" /> Start practice</Link></div>
        </div>
        <div className="content"><div className="card card-pad"><p className="muted">Run your first practice call to see your stats here.</p></div></div>
      </>
    );
  }
  const skills = [...a.skills].sort((x, y) => y.avg - x.avg);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{greeting()}, {first} 👋</h1>
          <p>{a.podName} · {a.sessions} reps · {a.trainingMin} min trained · calling for {a.perOffice.length} office{a.perOffice.length === 1 ? "" : "s"}</p>
        </div>
        <div className="tb-right">
          <Link className="btn btn-primary" href="/practice"><Icon name="mic" /> Start practice</Link>
        </div>
      </div>

      <div className="content">
        <div className="grid g-2" style={{ gridTemplateColumns: ".8fr 1.2fr", marginBottom: 18 }}>
          <div className="card card-pad rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div className="eyebrow">Your overall</div>
            <Ring value={a.overall} size={150} label="avg score" />
          </div>
          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <h3 style={{ fontSize: 17, marginBottom: 12 }}>Your skills</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {skills.map((s) => {
                const low = s.avg < 3.6;
                return (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 150, fontSize: 13, color: "var(--text-2)" }}>{s.name}</div>
                    <div style={{ flex: 1, height: 8, borderRadius: 99, background: "var(--s3)", overflow: "hidden" }}>
                      <div style={{ width: `${(s.avg / 5) * 100}%`, height: "100%", borderRadius: 99, background: low ? "var(--amber)" : "var(--grad-mint)" }} />
                    </div>
                    <div style={{ width: 34, textAlign: "right", fontSize: 13, fontWeight: 700, color: low ? "var(--amber)" : "var(--text)" }}>{s.avg.toFixed(1)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card card-pad rise" style={{ marginBottom: 18, animationDelay: ".1s" }}>
          <h3 style={{ fontSize: 17, marginBottom: 4 }}>Your accounts</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>How you&apos;re doing on each practice you call for.</p>
          <div className="grid g-3">
            {a.perOffice.map((o) => (
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

        <div className="card card-pad rise" style={{ animationDelay: ".15s" }}>
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>Recent calls</h3>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {a.recent.map((r) => (
              <Link key={r.id} href={`/results/${r.id}`} className="cc-agent-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.persona}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{r.officeName} · {relativeShort(r.startedAt)}</div>
                </div>
                <span className={"chip " + (r.score >= 4.3 ? "mint" : r.score < 3.7 ? "amber" : "")} style={{ padding: "2px 9px", fontFamily: "var(--font-lato)", fontWeight: 800 }}>{r.score ? r.score.toFixed(1) : "—"}</span>
                <Icon name="arrow" size={14} />
              </Link>
            ))}
            {a.recent.length === 0 && <p className="muted" style={{ fontSize: 13.5, paddingTop: 10 }}>No calls yet — hit Start practice.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
