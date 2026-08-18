import { requireUser, getActiveRole } from "@/lib/auth";
import { getOfficeLeaderboard, getGlobalLeaderboard } from "@/lib/queries";
import { getAgentLeaderboards, getCenterLeaderboards } from "@/lib/callcenter";
import { LeaderboardClient } from "@/components/leaderboard/LeaderboardClient";

export default async function LeaderboardPage() {
  const user = await requireUser();

  // Call-center phone agents + floor managers rank within their pod and across
  // the whole call center — not against practices.
  if (user.callCenterPodId) {
    const lb = await getAgentLeaderboards(user.id);
    if (lb) {
      return (
        <LeaderboardClient variant="agent" officeRows={lb.pod} globalRows={lb.center} officeName={lb.podName} />
      );
    }
  }

  // Senior call-center manager → agents (center-wide) vs pod standings.
  if (getActiveRole(user) === "CALL_CENTER_ADMIN" && user.organizationId) {
    const lb = await getCenterLeaderboards(user.organizationId);
    return (
      <LeaderboardClient variant="center" officeRows={lb.agents} globalRows={lb.pods} officeName={lb.centerName} />
    );
  }

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
