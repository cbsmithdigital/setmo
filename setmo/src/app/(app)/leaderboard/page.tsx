import { requireUser } from "@/lib/auth";
import { getOfficeLeaderboard, getGlobalLeaderboard } from "@/lib/queries";
import { LeaderboardClient } from "@/components/leaderboard/LeaderboardClient";

export default async function LeaderboardPage() {
  const user = await requireUser();
  const [officeRows, globalRows] = await Promise.all([
    user.officeId ? getOfficeLeaderboard(user.officeId, user.id) : Promise.resolve([]),
    getGlobalLeaderboard(user.officeId ?? null),
  ]);

  return (
    <LeaderboardClient
      officeRows={officeRows}
      globalRows={globalRows}
      officeName={user.office?.name ?? "Your practice"}
    />
  );
}
