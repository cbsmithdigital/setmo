import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getPlatformProjections } from "@/lib/platform";
import { StatTile } from "@/components/ui/StatTile";
import { ScenarioModel } from "@/components/platform/ScenarioModel";

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;

export default async function PlatformProjectionsPage() {
  await requireRole("PLATFORM_ADMIN", "SUPPORT");
  const p = await getPlatformProjections();

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Projections</h1>
          <p>Forecasts, upsell timing, and what-if planning.</p>
        </div>
      </div>

      <div className="content">
        <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
          <StatTile lab="Current MRR" val={usd(p.baseline.currentMRR)} grad="var(--grad-mint)" sub={`${p.baseline.activeLocations} active locations`} />
          <StatTile lab="Minute revenue run-rate" val={usd(p.baseline.monthlyMinuteRevenue)} sub="from current burn × blended rate" />
          <StatTile lab="Outstanding liability" val={usd(p.baseline.outstandingLiability)} sub="pre-sold minute cost owed" />
          <StatTile lab="Assessment → paid" val={`${p.assessment.rate}%`} sub={`${p.assessment.converted} of ${p.assessment.taken}`} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <ScenarioModel baseline={p.baseline} />
        </div>

        <div className="grid g-2">
          {/* days to empty */}
          <div className="card card-pad rise">
            <h3 style={{ fontSize: 18, marginBottom: 4 }}>Days to empty</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Balance ÷ burn rate — upsell timing &amp; churn early-warning.</p>
            {p.daysToEmpty.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No active burn yet.</p>}
            {p.daysToEmpty.slice(0, 12).map((a, i) => (
              <Link key={a.id} href={`/platform/accounts/${a.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{a.balanceMin.toLocaleString()} min · {a.burnPerDay.toFixed(1)}/day</div>
                </div>
                <span style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 16, color: a.days != null && a.days < 14 ? "var(--amber)" : "var(--text-1)" }}>{a.days != null ? `${a.days}d` : "—"}</span>
              </Link>
            ))}
          </div>

          {/* liability burn-down */}
          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <h3 style={{ fontSize: 18, marginBottom: 4 }}>Liability burn-down</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Pre-sold (rolled-over) minute cost still coming, at today&apos;s consumption.</p>
            {p.liabilitySchedule.map((m, i) => {
              const max = p.baseline.outstandingLiability || 1;
              const pct = Math.min(100, (m.remaining / max) * 100);
              return (
                <div key={m.month} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                  <span className="muted" style={{ width: 60, fontSize: 12.5 }}>Month {m.month}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 99, background: "#181828", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: pct + "%", background: "var(--grad)", borderRadius: 99 }} />
                  </div>
                  <span style={{ width: 64, textAlign: "right", fontSize: 13, fontFamily: "var(--font-lato)", fontWeight: 800 }}>{usd(m.remaining)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
