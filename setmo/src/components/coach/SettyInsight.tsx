import { Icon } from "@/components/ui/Icon";
import { relativeShort } from "@/lib/format";
import { InsightRefreshButton } from "./InsightRefreshButton";

type Insight = { headline: string; body: string; generatedAt: Date | string } | null;

// Setty's inline "next move" — the cached recommendation shown on the dashboards.
export function SettyInsight({
  scope,
  subjectId,
  insight,
  canRefresh = true,
}: {
  scope: "SETTER" | "OFFICE" | "GROUP";
  subjectId: string;
  insight: Insight;
  canRefresh?: boolean;
}) {
  if (!insight) return null;
  const lines = insight.body.split("\n").map((l) => l.trim()).filter(Boolean);
  const asBullets = lines.length > 1 && lines.every((l) => l.startsWith("-"));

  return (
    <div className="card card-pad rise" style={{ background: "linear-gradient(150deg,rgba(139,92,246,.16),var(--s2))", marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span className="chip purple" style={{ padding: "4px 11px", fontSize: 12 }}>
          <Icon name="spark" size={13} /> Setty&apos;s next move
        </span>
        {canRefresh && <InsightRefreshButton scope={scope} subjectId={subjectId} />}
      </div>
      <h3 style={{ fontSize: 18.5, marginBottom: 8 }}>{insight.headline}</h3>
      {asBullets ? (
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
          {lines.map((l, i) => (
            <li key={i} style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.5 }}>{l.replace(/^-\s*/, "")}</li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: 14.5, color: "var(--text-2)", lineHeight: 1.55 }}>{insight.body}</p>
      )}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
        Updated {relativeShort(insight.generatedAt ? new Date(insight.generatedAt) : null)} · cached, refreshes weekly
      </div>
    </div>
  );
}
