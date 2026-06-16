import { requireRole } from "@/lib/auth";
import { resolveAnalyticsRange } from "@/lib/queries";
import { getOfficeTeam, getOfficeOverview, getOfficeSkillMatrix } from "@/lib/office";
import { BUNDLES } from "@/lib/stripe";
import { TeamTable } from "@/components/office/TeamTable";
import { InviteButton } from "@/components/office/InviteButton";
import { BuyBundleButton } from "@/components/office/BuyBundleButton";
import { ProgressControls } from "@/components/progress/ProgressControls";
import { SkillMatrix } from "@/components/office/SkillMatrix";
import { Icon } from "@/components/ui/Icon";

const PRESETS = [
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "60d", label: "60 days" },
  { key: "3m", label: "3 months" },
  { key: "all", label: "All time" },
];

export default async function OfficeTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const sp = await searchParams;
  const { key, range, label } = resolveAnalyticsRange(sp);
  const [team, overview, matrix] = await Promise.all([
    getOfficeTeam(user.officeId!, range),
    getOfficeOverview(user.officeId!, range),
    getOfficeSkillMatrix(user.officeId!, range),
  ]);
  const seatsFree = Math.max(0, overview.seats - overview.activeSetters);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Team</h1>
          <p>Every setter&apos;s usage, score trend, and what to coach next · {label.toLowerCase()}.</p>
        </div>
        <div className="tb-right" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <ProgressControls active={key} from={sp.from} to={sp.to} basePath="/office/team" presets={PRESETS} />
          <BuyBundleButton bundles={BUNDLES} />
          <InviteButton seatsFree={seatsFree} />
        </div>
      </div>
      <div className="content">
        <TeamTable rows={team} />

        <div className="card card-pad rise" style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Icon name="target" size={15} />
            <h3 style={{ fontSize: 18 }}>Skill heatmap by setter</h3>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Averaged across this period. A warm column flags a skill the whole team needs; a warm row is one setter to coach.
          </p>
          <SkillMatrix skills={matrix.skills} rows={matrix.rows} rowLabel="Setter" hrefBase="/office/team" />
        </div>
      </div>
    </>
  );
}
