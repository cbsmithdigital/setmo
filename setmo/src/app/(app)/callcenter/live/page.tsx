import { requireRole, getActiveRole } from "@/lib/auth";
import { getLiveCalls } from "@/lib/ghl";
import { LiveCallsList } from "@/components/LiveCallsList";
import { Icon } from "@/components/ui/Icon";

// Call-center managers' view of agents' REAL calls (GHL) — senior sees the whole
// center, a floor manager their pod. Scored + outcome-analyzed, separate from
// practice analytics.
export default async function CallCenterLiveCallsPage() {
  const user = await requireRole("CALL_CENTER_ADMIN", "CALL_CENTER_MANAGER");
  const senior = getActiveRole(user) === "CALL_CENTER_ADMIN";

  // Floor scope carries BOTH pod + org so the list matches the results-page ACL
  // exactly (which requires session.callCenterOrgId === viewer.organizationId).
  const scope = senior
    ? user.organizationId ? { callCenterOrgId: user.organizationId } : null
    : user.callCenterPodId && user.organizationId ? { podId: user.callCenterPodId, callCenterOrgId: user.organizationId } : null;

  if (!scope) {
    return (
      <>
        <div className="topbar"><div className="tb-greet"><h1>Live calls</h1></div></div>
        <div className="content"><div className="card card-pad muted" style={{ fontSize: 14 }}>Your account isn&apos;t linked to a {senior ? "call center" : "pod"} yet.</div></div>
      </>
    );
  }

  const rows = await getLiveCalls(scope);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Live calls</h1>
          <p>Your agents&apos; real calls — scored, with outcome analysis and coaching{senior ? " · across every pod" : " · your pod"}.</p>
        </div>
        <div className="tb-right"><span className="chip"><Icon name="shield" size={13} /> PII-scrubbed transcripts</span></div>
      </div>
      <div className="content">
        <LiveCallsList rows={rows} showOffice />
      </div>
    </>
  );
}
