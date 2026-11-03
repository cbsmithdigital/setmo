"use client";

import { Ring } from "@/components/ui/widgets";
import { Icon } from "@/components/ui/Icon";
import { mmss } from "@/lib/format";

// The results of an embedded partner call, shown in place inside the partner's
// app once the call is scored. The same data as SetMo's own results page, minus
// anything that links into SetMo (coach, practice, saved calls).

export type EmbedResult = {
  service: string;
  persona: string;
  durationSeconds: number;
  score: number;
  tooShort: boolean;
  showRate: number;
  narrative: string;
  skills: { name: string; tier: "universal" | "service_specific"; score: number }[];
  wins: string[];
  misses: string[];
  phrases: { from: string; to: string }[];
  reveal: { name: string; age: number | null; forWhom: string | null; situation: string; realReason: string; hesitation: string; tone: string; difficulty: string | null; choice: string | null } | null;
  revealCheck: { why: { found: string; note: string }; hesitation: { handled: string; note: string } } | null;
};

const FOUND: Record<string, { label: string; cls: string }> = {
  yes: { label: "Found it", cls: "mint" },
  partly: { label: "Partly", cls: "amber" },
  no: { label: "Missed it", cls: "rose" },
};
const HANDLED: Record<string, { label: string; cls: string }> = {
  yes: { label: "Handled", cls: "mint" },
  partly: { label: "Partly handled", cls: "amber" },
  no: { label: "Not handled", cls: "rose" },
  not_raised: { label: "Never came up", cls: "" },
};

// The likely-to-show pill's color band (same bands as SetMo's results page).
function showColor(rate: number): { bg: string; fg: string } {
  if (rate >= 56) return { bg: "rgba(52,211,153,.15)", fg: "var(--mint)" };
  if (rate >= 46) return { bg: "rgba(251,191,36,.16)", fg: "var(--amber)" };
  if (rate >= 36) return { bg: "rgba(239,68,68,.15)", fg: "#fb7185" };
  return { bg: "rgba(148,163,184,.15)", fg: "var(--muted)" };
}

export function EmbedResults({ r }: { r: EmbedResult }) {
  const show = showColor(r.showRate);
  const found = r.revealCheck ? FOUND[r.revealCheck.why.found] : null;
  const handled = r.revealCheck ? HANDLED[r.revealCheck.hesitation.handled] : null;
  return (
    <div className="embed-results">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24 }}>How you did</h1>
        <p className="muted" style={{ fontSize: 13.5 }}>
          {r.service} · {r.persona} · {mmss(r.durationSeconds)}
        </p>
      </div>

      {r.tooShort ? (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>Too short to score</h2>
          <p className="muted" style={{ fontSize: 14 }}>A call needs at least a minute and a few back-and-forths before it can be scored.</p>
        </div>
      ) : (
        <div className="card card-pad card-glow" style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <Ring value={r.score} size={124} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <span className="chip" style={{ background: show.bg, color: show.fg, border: "none", marginBottom: 10 }}>
              <Icon name="target" size={13} /> {r.showRate}% likely to show
            </span>
            {r.narrative && <h2 style={{ fontSize: 19, lineHeight: 1.25, marginTop: 8 }}>{r.narrative}</h2>}
          </div>
        </div>
      )}

      {r.reveal && (
        <div className="card card-pad reveal" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <h3 style={{ fontSize: 16.5 }}>Who you were really talking to</h3>
            {r.reveal.difficulty && <span className="chip" style={{ fontSize: 11.5 }}>{r.reveal.difficulty}</span>}
          </div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {r.reveal.name}
            {r.reveal.age ? <span className="muted" style={{ fontWeight: 400 }}>, {r.reveal.age}</span> : null}
            {r.reveal.forWhom ? <span className="muted" style={{ fontWeight: 400 }}> · {r.reveal.forWhom}</span> : null}
          </div>
          {r.reveal.situation && <p className="muted" style={{ fontSize: 13.5, margin: "4px 0 12px" }}>{r.reveal.situation}</p>}
          <div className="grid g-2" style={{ gap: 12 }}>
            <div className="reveal-item">
              <div className="reveal-k">
                Their real reason {found && <span className={"chip " + found.cls} style={{ fontSize: 11, padding: "2px 8px" }}>{found.label}</span>}
              </div>
              <div className="reveal-v">&ldquo;{r.reveal.realReason}&rdquo;</div>
              {r.revealCheck?.why.note && <div className="reveal-note">{r.revealCheck.why.note}</div>}
            </div>
            <div className="reveal-item">
              <div className="reveal-k">
                What was holding them back {handled && <span className={"chip " + handled.cls} style={{ fontSize: 11, padding: "2px 8px" }}>{handled.label}</span>}
              </div>
              <div className="reveal-v">&ldquo;{r.reveal.hesitation}&rdquo;</div>
              {r.revealCheck?.hesitation.note && <div className="reveal-note">{r.revealCheck.hesitation.note}</div>}
            </div>
          </div>
        </div>
      )}

      {!r.tooShort && (
        <div className="grid g-2" style={{ marginBottom: 16 }}>
          <div className="card card-pad">
            <h3 style={{ fontSize: 16.5, marginBottom: 6 }}>Skill breakdown</h3>
            {r.skills.map((s) => {
              const high = s.score >= 4.4;
              return (
                <div key={s.name} className="skill" style={{ padding: "6px 0" }}>
                  <div className="nm">
                    <span className={s.tier === "universal" ? "uni" : "spc"} />
                    {s.name}
                  </div>
                  <div className="track">
                    <div className={"fill" + (high ? " mint" : "")} style={{ width: (s.score / 5) * 100 + "%" }} />
                  </div>
                  <div className="sc" style={{ color: high ? "var(--mint)" : s.score < 4 ? "var(--amber)" : "#fff" }}>{s.score.toFixed(1)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card card-pad">
              <h3 style={{ fontSize: 16, marginBottom: 10 }}>What you nailed</h3>
              {r.wins.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>No standout wins flagged this rep.</p>}
              {r.wins.map((w, i) => (
                <p key={i} style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 8 }}>✓ {w}</p>
              ))}
            </div>
            <div className="card card-pad">
              <h3 style={{ fontSize: 16, marginBottom: 10 }}>Where to grow</h3>
              {r.misses.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>Nothing major to fix — keep going.</p>}
              {r.misses.map((w, i) => (
                <p key={i} style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 8 }}>
                  {i + 1}. {w}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {r.phrases.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 16.5, marginBottom: 12 }}>Try these next time</h3>
          <div className="grid g-2">
            {r.phrases.map((p, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 12, padding: "11px 13px", fontSize: 14, color: "var(--text-2)" }}>
                  <b style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--rose)", display: "block", marginBottom: 4 }}>You said</b>
                  {p.from}
                </div>
                <div style={{ background: "rgba(52,211,153,.07)", border: "1px solid rgba(52,211,153,.22)", borderRadius: 12, padding: "11px 13px", fontSize: 14, color: "#fff" }}>
                  <b style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mint)", display: "block", marginBottom: 4 }}>Try instead</b>
                  {p.to}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
