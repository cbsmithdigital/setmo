import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

type Step = { key: string; label: string; desc: string; href: string; cta: string; done: boolean };
type Data = { steps: Step[]; doneCount: number; allDone: boolean };

// First-run activation checklist. Renders nothing once every step is complete.
export function OnboardingChecklist({ data }: { data: Data }) {
  if (data.allDone) return null;
  return (
    <div className="card card-pad rise" style={{ marginBottom: 18, background: "linear-gradient(150deg,rgba(139,92,246,.14),var(--s2))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <h3 style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="bolt" size={16} /> Get set up
        </h3>
        <span className="chip" style={{ padding: "3px 10px", fontSize: 12 }}>{data.doneCount} of {data.steps.length} done</span>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>A few quick steps to get your practice running. This disappears once you&apos;re all set.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {data.steps.map((s, i) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
            <div style={{ width: 24, height: 24, borderRadius: 99, flex: "none", display: "grid", placeItems: "center", background: s.done ? "var(--grad-mint)" : "var(--s1)", border: s.done ? "none" : "1px solid var(--line)", color: "#0d0d18" }}>
              {s.done && <Icon name="check" size={14} sw={3} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5, textDecoration: s.done ? "line-through" : "none", color: s.done ? "var(--muted)" : "var(--text-1)" }}>{s.label}</div>
              <div className="muted" style={{ fontSize: 12 }}>{s.desc}</div>
            </div>
            {s.done ? (
              <span className="mint-text" style={{ fontSize: 12.5, fontWeight: 600 }}>Done</span>
            ) : (
              <Link className="btn btn-primary" href={s.href} style={{ padding: "7px 14px", fontSize: 13 }}>{s.cta}</Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
