import type { OfficeFunnel } from "@/lib/outcomes";

export const fmtMoney = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);

function Badge({ source }: { source: "reported" | "projected" }) {
  return source === "reported" ? (
    <span className="chip mint" style={{ padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>Actual</span>
  ) : (
    <span className="chip" style={{ padding: "1px 7px", fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>Projected</span>
  );
}

function Step({ label, value, source }: { label: string; value: string; source: "reported" | "projected" }) {
  return (
    <div style={{ flex: 1, minWidth: 96 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 22, lineHeight: 1.1, marginBottom: 5 }}>{value}</div>
      <Badge source={source} />
    </div>
  );
}

// Set rate + show rate (the SetMo practice signal) and the projected funnel that
// real entered numbers override. Used on the office overview.
export function OutcomesInsight({ funnel, periodName }: { funnel: OfficeFunnel; periodName: string }) {
  return (
    <div className="card card-pad rise" style={{ animationDelay: ".18s", marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 18 }}>Outcomes &amp; impact</h3>
        <span className="chip" style={{ padding: "3px 10px", fontSize: 11.5 }}>{periodName}</span>
      </div>
      {funnel.sessions === 0 ? (
        <p className="muted" style={{ fontSize: 13.5, marginTop: 8 }}>No scored practice calls this month yet — set rate, show rate, and projections appear once your team practices.</p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            Set rate &amp; show rate come from your team&apos;s {funnel.sessions} scored call{funnel.sessions === 1 ? "" : "s"}. The funnel is projected from those rates — enter real numbers below to replace any step.
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
            <div className="stat-tile" style={{ flex: 1, minWidth: 150 }}>
              <div className="lab">Set rate</div>
              <div className="val" style={{ background: "var(--grad-mint)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{funnel.setRatePct}%</div>
              <div className="sub">consults booked on practice calls</div>
            </div>
            <div className="stat-tile" style={{ flex: 1, minWidth: 150 }}>
              <div className="lab">Show rate</div>
              <div className="val">{funnel.showRatePct}%</div>
              <div className="sub">modeled from call quality</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
            <Step label="New leads" value={String(funnel.leads.value)} source={funnel.leads.source} />
            <Arrow />
            <Step label="Consults" value={String(funnel.consults.value)} source={funnel.consults.source} />
            <Arrow />
            <Step label="Cases started" value={String(funnel.cases.value)} source={funnel.cases.source} />
            <Arrow />
            <Step label="Production" value={fmtMoney(funnel.production.value)} source={funnel.production.source} />
          </div>
        </>
      )}
    </div>
  );
}

function Arrow() {
  return <div style={{ alignSelf: "center", color: "var(--muted)", fontSize: 18, paddingTop: 14 }}>→</div>;
}
