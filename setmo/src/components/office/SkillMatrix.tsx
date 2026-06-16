import Link from "next/link";

export type MatrixRow = {
  id: string;
  name: string;
  avg: number;
  cells: { key: string; score: number | null }[];
};

// Heat band for a single skill score. Low skills read warm (needs work),
// strong skills read mint — so a column of amber instantly flags a shared gap.
function cell(score: number | null): { bg: string; fg: string } {
  if (score == null) return { bg: "var(--s1)", fg: "var(--muted)" };
  if (score < 3.4) return { bg: "rgba(251,113,133,.18)", fg: "#fb7185" };
  if (score < 3.8) return { bg: "rgba(251,191,36,.16)", fg: "#fbbf24" };
  if (score < 4.3) return { bg: "rgba(167,139,250,.16)", fg: "#c4b5fd" };
  return { bg: "rgba(52,211,153,.20)", fg: "#34d399" };
}

// Rows (locations or setters) × the 8 skills, color-coded. Scrolls on mobile.
export function SkillMatrix({
  skills,
  rows,
  rowLabel = "Location",
  hrefBase,
}: {
  skills: { key: string; short: string }[];
  rows: MatrixRow[];
  rowLabel?: string;
  hrefBase?: string;
}) {
  if (rows.length === 0) {
    return <p className="muted" style={{ fontSize: 13 }}>Not enough scored calls in this window yet.</p>;
  }
  const cols = `minmax(132px, 1.5fr) 52px repeat(${skills.length}, minmax(50px, 1fr))`;
  return (
    <div style={{ overflowX: "auto", margin: "0 -4px", padding: "0 4px" }}>
      <div style={{ minWidth: 560 }}>
        {/* header */}
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 4, alignItems: "end", marginBottom: 4 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>{rowLabel}</div>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, textAlign: "center" }}>Avg</div>
          {skills.map((s) => (
            <div key={s.key} className="muted" style={{ fontSize: 10.5, fontWeight: 600, textAlign: "center", lineHeight: 1.15 }}>
              {s.short}
            </div>
          ))}
        </div>
        {/* rows */}
        {rows.map((r, i) => {
          const avgC = cell(r.avg);
          const nameNode = (
            <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
          );
          return (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 4, alignItems: "center", padding: "4px 0", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
              <div style={{ minWidth: 0 }}>
                {hrefBase ? (
                  <Link href={`${hrefBase}/${r.id}`} style={{ color: "var(--text-1)" }}>{nameNode}</Link>
                ) : (
                  nameNode
                )}
              </div>
              <div style={{ textAlign: "center", fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 13.5, borderRadius: 7, padding: "6px 0", background: avgC.bg, color: avgC.fg }}>
                {r.avg ? r.avg.toFixed(1) : "—"}
              </div>
              {r.cells.map((c) => {
                const st = cell(c.score);
                return (
                  <div key={c.key} title={`${r.name} · ${c.score?.toFixed(1) ?? "—"}`} style={{ textAlign: "center", fontFamily: "var(--font-lato)", fontWeight: 800, fontSize: 13, borderRadius: 7, padding: "6px 0", background: st.bg, color: st.fg }}>
                    {c.score != null ? c.score.toFixed(1) : "·"}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
