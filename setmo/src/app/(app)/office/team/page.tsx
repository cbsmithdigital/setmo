import { requireRole } from "@/lib/auth";
import { getOfficeTeam, getOfficeOverview } from "@/lib/office";
import { BUNDLES } from "@/lib/stripe";
import { TeamTable } from "@/components/office/TeamTable";
import { InviteButton } from "@/components/office/InviteButton";
import { BuyBundleButton } from "@/components/office/BuyBundleButton";

export default async function OfficeTeamPage() {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const [team, overview] = await Promise.all([
    getOfficeTeam(user.officeId!),
    getOfficeOverview(user.officeId!),
  ]);
  const seatsFree = Math.max(0, overview.seats - overview.activeSetters);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Team</h1>
          <p>Every setter&apos;s usage, score trend, and what to coach next.</p>
        </div>
        <div className="tb-right" style={{ display: "flex", gap: 10 }}>
          <BuyBundleButton bundles={BUNDLES} />
          <InviteButton seatsFree={seatsFree} />
        </div>
      </div>
      <div className="content">
        <TeamTable rows={team} />
      </div>
    </>
  );
}
