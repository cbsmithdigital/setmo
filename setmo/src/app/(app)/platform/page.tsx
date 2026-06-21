import { requireRole } from "@/lib/auth";
import { getPlatformOverview, getPlatformAlerts } from "@/lib/platform";
import { StatTile } from "@/components/ui/StatTile";
import { RevenueVsCost, CostByBucket } from "@/components/platform/PlatformCharts";
import { AlertsCard } from "@/components/platform/AlertsCard";

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const usdc = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function PlatformOverviewPage() {
  await requireRole("PLATFORM_ADMIN", "SUPPORT");
  const [p, alerts] = await Promise.all([getPlatformOverview(), getPlatformAlerts()]);
  const chart = p.series.map((s) => ({ ...s, revenue: s.access + s.cashRev, cost: s.cogs + s.cac + s.paidAssessment }));

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Platform overview</h1>
          <p>{p.accounts} accounts · {p.locations} locations · {p.prospects} prospects</p>
        </div>
      </div>

      <div className="content">
        <AlertsCard alerts={alerts} />

        {/* revenue row */}
        <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
          <StatTile lab="Access MRR" val={usdc(p.accessMRR)} grad="var(--grad-mint)" sub={`${p.activeAccess} active locations × $${44.95}`} />
          <StatTile lab="Minute revenue (cash)" val={usd(p.cashRev)} sub={`${p.purchasedMin.toLocaleString()} min sold`} />
          <StatTile lab="Minute revenue (realized)" val={usd(p.realizedRev)} sub={`${p.consumedPayingMin.toLocaleString()} min consumed`} />
          <StatTile lab="Minute gross margin" val={`${p.minuteGrossMarginPct}%`} sub={`blended $${p.blendedRate.toFixed(2)}/min vs $0.15 cost`} />
        </div>

        {/* cost row */}
        <div className="grid g-4 rise" style={{ marginBottom: 18, animationDelay: ".05s" }}>
          <StatTile lab="COGS (consumed)" val={usd(p.cogs)} sub="paying minutes × $0.15" />
          <StatTile lab="Assessment CAC" val={usd(p.cac)} sub="prospect assessment minutes" />
          <StatTile lab="Outstanding liability" val={usd(p.liability)} sub={`${p.outstandingMin.toLocaleString()} unconsumed min owed`} />
          <StatTile lab="Assessment → paid" val={`${p.assessment.rate}%`} sub={`${p.assessment.converted} of ${p.assessment.taken} converted`} />
        </div>

        <div className="grid g-2" style={{ marginBottom: 18 }}>
          <div className="card card-pad rise">
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Revenue vs. variable cost</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Access + minute cash revenue against minutes consumed × $0.15. Access shown at current run-rate.</p>
            <RevenueVsCost data={chart} />
          </div>
          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Cost by bucket</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Keeps margin honest — a prospect&apos;s free-assessment minute is CAC, not COGS.</p>
            <CostByBucket data={chart} />
          </div>
        </div>

        <div className="card card-pad rise" style={{ fontSize: 12.5 }} >
          <span className="muted">
            Cash margin (sold) and realized margin (consumed) differ because minutes roll over — selling a bundle is cash now but cost owed later.
            Fixed overhead isn&apos;t loaded, so profit figures are approximate. Historical access counts aren&apos;t tracked yet (MRR shown at run-rate).
          </span>
        </div>
      </div>
    </>
  );
}
