import Image from "next/image";
import { notFound } from "next/navigation";
import { getSharedRecording } from "@/lib/queries";
import { Icon } from "@/components/ui/Icon";
import { Ring } from "@/components/ui/widgets";
import { mmss, whenLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await getSharedRecording(token);
  if (!r) notFound();

  return (
    <>
      <div className="app-bg" />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 940, margin: "0 auto", padding: "28px 20px 64px" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div className="sb-logo" style={{ padding: 0 }}>
            <Image src="/setmo-icon.png" alt="" width={30} height={30} style={{ objectFit: "contain" }} />
            <span>
              Set<span style={{ color: "var(--mint)" }}>Mo</span>
            </span>
          </div>
          <span className="chip">Shared call review · read-only</span>
        </div>

        <div className="tb-greet" style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 26 }}>{r.setterName}&apos;s practice call</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            {r.officeName ? `${r.officeName} · ` : ""}{r.service} · {r.persona} · {mmss(r.durationSeconds)} · {whenLabel(r.when)}
          </p>
        </div>

        {/* headline */}
        <div className="card card-pad card-glow" style={{ display: "flex", gap: 28, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
          <Ring value={r.score} size={132} />
          {r.narrative && <h2 style={{ fontSize: 22, maxWidth: "24em", lineHeight: 1.25, flex: 1, minWidth: 240 }}>{r.narrative}</h2>}
        </div>

        <div className="grid g-2" style={{ gridTemplateColumns: "1.1fr .9fr", marginBottom: 18 }}>
          {/* skills */}
          <div className="card card-pad">
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Skill breakdown</h3>
            {r.skills.map((s) => {
              const high = s.score >= 4.4;
              return (
                <div key={s.name} className="skill" style={{ padding: "7px 0" }}>
                  <div className="nm">
                    <span className={s.tier === "universal" ? "uni" : "spc"} />
                    {s.name}
                  </div>
                  <div className="track">
                    <div className={"fill" + (high ? " mint" : "")} style={{ width: (s.score / 5) * 100 + "%" }} />
                  </div>
                  <div className="sc" style={{ color: high ? "var(--mint)" : s.score < 4 ? "var(--amber)" : "#fff" }}>
                    {s.score.toFixed(1)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* wins + misses */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card card-pad">
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>What they nailed</h3>
              {r.wins.map((w, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 13.5, color: "var(--text-2)" }}>
                  <span style={{ color: "var(--mint)", flex: "none" }}><Icon name="check" size={15} sw={3} /></span>
                  {w}
                </div>
              ))}
              {r.wins.length === 0 && <p className="muted" style={{ fontSize: 13 }}>—</p>}
            </div>
            <div className="card card-pad">
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>Where to grow</h3>
              {r.misses.map((w, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 13.5, color: "var(--text-2)" }}>
                  <span style={{ color: "var(--amber)", flex: "none", fontWeight: 800 }}>{i + 1}</span>
                  {w}
                </div>
              ))}
              {r.misses.length === 0 && <p className="muted" style={{ fontSize: 13 }}>—</p>}
            </div>
          </div>
        </div>

        {/* recording + transcript */}
        {(r.audioAvailable || r.transcript.length > 0) && (
          <div className="card card-pad">
            <h3 style={{ fontSize: 18, marginBottom: 14 }}>Recording & transcript</h3>
            {r.audioAvailable && (
              <audio controls preload="none" src={`/shared/${token}/audio`} style={{ width: "100%", marginBottom: r.transcript.length ? 16 : 0 }} />
            )}
            {r.transcript.length > 0 && (
              <div style={{ maxHeight: 460, overflowY: "auto", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--s1)", padding: "6px 0" }}>
                {r.transcript.map((turn, i) => {
                  const you = turn.speaker === "you";
                  return (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "9px 16px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                      <div style={{ width: 64, flex: "none", textAlign: "right" }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: you ? "var(--mint)" : "var(--purple-2)" }}>
                          {you ? "Setter" : "Lead"}
                        </div>
                        <div className="muted" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{mmss(turn.t)}</div>
                      </div>
                      <div style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.5 }}>{turn.text}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <p className="muted" style={{ fontSize: 12.5, textAlign: "center", marginTop: 24 }}>
          Shared via <b style={{ color: "var(--text-2)" }}>SetMo</b> — appointment-setter training for dental practices.
        </p>
      </div>
    </>
  );
}
