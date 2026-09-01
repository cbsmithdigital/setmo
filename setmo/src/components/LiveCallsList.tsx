import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { whenLabel, mmss } from "@/lib/format";
import type { LiveCallRow } from "@/lib/ghl";

// Shared list for the manager Live Calls pages (office + call-center views).
export function LiveCallsList({ rows, showOffice = false }: { rows: LiveCallRow[]; showOffice?: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="card card-pad muted" style={{ fontSize: 14 }}>
        No live calls yet. Once the GHL workflow is connected, every completed call lands here scored within a few minutes.
      </div>
    );
  }
  return (
    <div className="card card-pad rise">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((c, i) => (
          <Link
            key={c.id}
            href={`/results/${c.id}`}
            style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 8px", borderRadius: 10, borderTop: i ? "1px solid var(--line-soft)" : "none" }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--s3)", display: "grid", placeItems: "center", color: c.booked ? "var(--mint)" : "var(--purple-2)", flex: "none" }}>
              <Icon name="sound" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.setterName}
                {showOffice && c.officeName ? <span className="muted" style={{ fontWeight: 400 }}> · {c.officeName}</span> : null}
              </div>
              <div className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {whenLabel(c.when)} · ~{mmss(c.durationSeconds)}
                {c.leadStates.length ? ` · lead: ${c.leadStates.slice(0, 3).join(", ").toLowerCase()}` : ""}
              </div>
            </div>
            {c.lowConfidence && <span className="chip" style={{ fontSize: 10.5, color: "var(--amber)", flex: "none" }} title="Garbled transcript — directional only">low conf.</span>}
            {c.primaryBlocker && <span className="chip amber" style={{ fontSize: 11, flex: "none" }}>{c.primaryBlocker}</span>}
            <span className={"chip " + (c.booked ? "mint" : "")} style={{ fontSize: 11.5, fontWeight: 700, flex: "none" }}>{c.disposition}</span>
            <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 19, width: 44, textAlign: "right" }} className={c.score >= 4 ? "mint-text" : "grad-text"}>
              {c.score ? c.score.toFixed(1) : "—"}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
