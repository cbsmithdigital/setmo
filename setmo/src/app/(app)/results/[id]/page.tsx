import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { Icon } from "@/components/ui/Icon";
import { Ring } from "@/components/ui/widgets";
import { RecordingActions } from "@/components/RecordingActions";
import { mmss } from "@/lib/format";

function ResultSkill({
  s,
  i,
}: {
  s: { name: string; tier: "universal" | "service_specific"; score: number };
  i: number;
}) {
  const high = s.score >= 4.4;
  return (
    <div className="skill" style={{ padding: "7px 0" }}>
      <div className="nm">
        <span className={s.tier === "universal" ? "uni" : "spc"} />
        {s.name}
      </div>
      <div className="track">
        <div
          className={"fill" + (high ? " mint" : "")}
          style={{ width: (s.score / 5) * 100 + "%", animationDelay: i * 0.05 + "s" }}
        />
      </div>
      <div className="sc" style={{ color: high ? "var(--mint)" : s.score < 4 ? "var(--amber)" : "#fff" }}>
        {s.score.toFixed(1)}
      </div>
    </div>
  );
}

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const r = await getSessionResult(id, user);
  if (!r) notFound();

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{r.isOwner ? "How you did" : `${r.setterName}'s call`}</h1>
          <p>
            {r.service} · {r.persona} · {mmss(r.durationSeconds)}
          </p>
        </div>
        <div className="tb-right" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {r.isOwner ? (
            <>
              <Link className="btn btn-ghost" href="/dashboard">
                Done
              </Link>
              <Link className="btn btn-ghost" href={`/coach?session=${r.sessionId}`}>
                <Icon name="chat" /> Coach me from this call
              </Link>
              <Link className="btn btn-primary" href="/practice">
                <Icon name="mic" /> Run another
              </Link>
            </>
          ) : (
            <Link className="btn btn-ghost" href="/library">
              Back to saved
            </Link>
          )}
        </div>
      </div>

      <div className="content">
        {/* headline score */}
        <div className="card card-pad card-glow rise" style={{ display: "flex", gap: 30, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
          <Ring value={r.score} size={150} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              {r.prev != null && r.score >= r.prev && (
                <span className="chip mint">
                  <Icon name="spark" size={13} /> Up from {r.prev.toFixed(1)}
                </span>
              )}
              {r.prev != null && r.score < r.prev && (
                <span className="chip">Down from {r.prev.toFixed(1)} — next rep counts</span>
              )}
            </div>
            {r.narrative && <h2 style={{ fontSize: 24, maxWidth: "22em", lineHeight: 1.2 }}>{r.narrative}</h2>}
          </div>
        </div>

        <div className="grid g-2" style={{ gridTemplateColumns: "1.1fr .9fr", marginBottom: 18 }}>
          {/* skill breakdown */}
          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ fontSize: 18 }}>Skill breakdown</h3>
              <div style={{ display: "flex", gap: 14, fontSize: 12 }} className="muted">
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 9, background: "var(--purple)" }} />
                  Universal
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 9, background: "var(--mint)" }} />
                  Implant-specific
                </span>
              </div>
            </div>
            {r.skills.map((s, i) => (
              <ResultSkill key={s.name} s={s} i={i} />
            ))}
          </div>

          {/* wins + misses */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
              <h3 style={{ fontSize: 17, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--mint)" }}>
                  <Icon name="check" size={18} sw={2.6} />
                </span>{" "}
                What you nailed
              </h3>
              {r.wins.map((w, i) => (
                <div key={i} style={{ display: "flex", gap: 11, marginBottom: 12 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      background: "rgba(52,211,153,.14)",
                      color: "var(--mint)",
                      display: "grid",
                      placeItems: "center",
                      flex: "none",
                      marginTop: 1,
                    }}
                  >
                    <Icon name="check" size={13} sw={3} />
                  </span>
                  <span style={{ fontSize: 14, color: "var(--text-2)" }}>{w}</span>
                </div>
              ))}
              {r.wins.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>No standout wins flagged this rep.</p>}
            </div>
            <div className="card card-pad rise" style={{ animationDelay: ".15s" }}>
              <h3 style={{ fontSize: 17, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--amber)" }}>
                  <Icon name="target" size={17} />
                </span>{" "}
                Where to grow
              </h3>
              {r.misses.map((w, i) => (
                <div key={i} style={{ display: "flex", gap: 11, marginBottom: 12 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      background: "rgba(251,191,36,.14)",
                      color: "var(--amber)",
                      display: "grid",
                      placeItems: "center",
                      flex: "none",
                      marginTop: 1,
                      fontWeight: 800,
                      fontSize: 12,
                      fontFamily: "var(--font-lato)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 14, color: "var(--text-2)" }}>{w}</span>
                </div>
              ))}
              {r.misses.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>Nothing major to fix — keep going.</p>}
            </div>
          </div>
        </div>

        {/* replacement phrases */}
        {r.phrases.length > 0 && (
          <div className="card card-pad rise" style={{ marginBottom: 18, animationDelay: ".2s" }}>
            <h3 style={{ fontSize: 18, marginBottom: 4 }}>Try these next time</h3>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
              Swap what tripped you up for language that moves the call forward.
            </p>
            <div className="grid g-2">
              {r.phrases.map((p, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 12, padding: "13px 15px" }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: ".1em",
                        textTransform: "uppercase",
                        color: "var(--rose)",
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Icon name="x" size={12} sw={2.6} /> You said
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text-2)" }}>{p.from}</div>
                  </div>
                  <div style={{ background: "rgba(52,211,153,.07)", border: "1px solid rgba(52,211,153,.22)", borderRadius: 12, padding: "13px 15px" }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: ".1em",
                        textTransform: "uppercase",
                        color: "var(--mint)",
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Icon name="check" size={12} sw={2.6} /> Try instead
                    </div>
                    <div style={{ fontSize: 14, color: "#fff" }}>{p.to}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* next scenario */}
        {r.nextScenario && (
          <div className="card card-pad rise" style={{ animationDelay: ".25s", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div className="chip" style={{ marginBottom: 12 }}>
                <Icon name="bolt" size={13} /> Suggested next lead
              </div>
              <h3 style={{ fontSize: 19, marginBottom: 6 }}>Try a tougher one</h3>
              <p className="muted" style={{ fontSize: 14, maxWidth: "40em" }}>{r.nextScenario}</p>
            </div>
            <Link className="btn btn-primary" href="/practice">
              <Icon name="mic" /> Run this rep
            </Link>
          </div>
        )}

        {/* recording + transcript */}
        {(r.audioAvailable || r.transcript.length > 0) && (
          <div className="card card-pad rise" style={{ marginTop: 18, animationDelay: ".3s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Icon name="sound" size={18} color="var(--purple-2)" />
              <h3 style={{ fontSize: 18 }}>Listen back</h3>
            </div>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>
              Replay the call and read the transcript — hear exactly where it turned.
            </p>

            <RecordingActions sessionId={r.sessionId} initialSaved={r.saved} initialShareToken={r.shareToken} />

            {r.audioAvailable ? (
              <audio
                controls
                preload="none"
                src={`/api/sessions/${r.sessionId}/audio`}
                style={{ width: "100%", marginBottom: r.transcript.length ? 18 : 0 }}
              />
            ) : (
              <div className="muted" style={{ fontSize: 13, marginBottom: r.transcript.length ? 18 : 0 }}>
                The recording will appear here once it finishes processing.
              </div>
            )}

            {r.transcript.length > 0 && (
              <div
                style={{
                  maxHeight: 420,
                  overflowY: "auto",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r-lg)",
                  background: "var(--s1)",
                  padding: "6px 0",
                }}
              >
                {r.transcript.map((turn, i) => {
                  const you = turn.speaker === "you";
                  return (
                    <div
                      key={i}
                      style={{ display: "flex", gap: 12, padding: "9px 16px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}
                    >
                      <div style={{ width: 70, flex: "none", textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            letterSpacing: ".04em",
                            textTransform: "uppercase",
                            color: you ? "var(--mint)" : "var(--purple-2)",
                          }}
                        >
                          {you ? "You" : "Lead"}
                        </div>
                        <div className="muted" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                          {mmss(turn.t)}
                        </div>
                      </div>
                      <div style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.5 }}>{turn.text}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
