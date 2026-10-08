import type { LeadCard as LeadCardData } from "@/lib/realism/lead-card";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** What the practice has on file for a lead — the CRM view a setter reads
 *  before dialing. Never the hidden reason or the hesitation. */
export function LeadCard({ card, offer }: { card: LeadCardData; offer?: string | null }) {
  const rows: [string, string][] = [
    ["Came in", `${card.source} · ${card.optedIn}`],
    ...(card.interest ? ([["Interested in", card.interest]] as [string, string][]) : []),
    ...(card.insurance ? ([["Insurance", card.insurance]] as [string, string][]) : []),
    ["Call history", card.attempts],
    ...(offer ? ([["Responding to", offer]] as [string, string][]) : []),
  ];
  return (
    <div className="lead-card">
      <div className="lc-head">
        <div className="lc-av">{initials(card.name)}</div>
        <div style={{ minWidth: 0 }}>
          <div className="lc-name">
            {card.name}
            {card.age ? <span className="lc-age">, {card.age}</span> : null}
          </div>
          <div className="lc-sub">{card.forWhom ?? "Calling about themselves"}</div>
        </div>
      </div>
      <div className="lc-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="lc-row">
            <div className="lc-k">{k}</div>
            <div className="lc-v">{v}</div>
          </div>
        ))}
      </div>
      {card.note && (
        <div className="lc-note">
          <div className="lc-note-k">{card.noteLabel}</div>
          &ldquo;{card.note}&rdquo;
        </div>
      )}
    </div>
  );
}
