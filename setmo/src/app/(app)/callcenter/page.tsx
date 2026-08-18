import { requireRole, getActiveRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { StatTile } from "@/components/ui/StatTile";

// P1 foundation stub. The agent-centric floor/senior dashboards (agent rosters,
// per-office breakdowns, pod rollups) land in P2.
export default async function CallCenterHome() {
  const user = await requireRole("CALL_CENTER_ADMIN", "CALL_CENTER_MANAGER");
  const orgId = user.organizationId;
  const org = orgId ? await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }) : null;
  const [pods, agents, offices] = orgId
    ? await Promise.all([
        prisma.pod.count({ where: { organizationId: orgId } }),
        prisma.user.count({ where: { pod: { organizationId: orgId } } }),
        prisma.office.count({ where: { servedByPod: { organizationId: orgId } } }),
      ])
    : [0, 0, 0];
  const isSenior = getActiveRole(user) === "CALL_CENTER_ADMIN";

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{org?.name ?? "Call center"}</h1>
          <p>{isSenior ? "Senior manager — all pods, agents, and served offices." : "Floor manager — your pod's agents and accounts."}</p>
        </div>
      </div>

      <div className="content">
        <div className="grid g-3 rise" style={{ marginBottom: 18 }}>
          <StatTile lab="Pods" val={String(pods)} sub="floor-manager teams" />
          <StatTile lab="Phone agents" val={String(agents)} sub="across the call center" />
          <StatTile lab="Served offices" val={String(offices)} sub="practices you call for" />
        </div>
        <div className="card card-pad">
          <h3 style={{ fontSize: 17, marginBottom: 6 }}>Foundation in place</h3>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
            The call-center structure (pods, agents shared across offices, and a pooled practice balance) is live.
            Agent-centric rollups — per-agent scores with per-office breakdowns, pod performance, and the served-practice reporting view — are coming next.
          </p>
        </div>
      </div>
    </>
  );
}
