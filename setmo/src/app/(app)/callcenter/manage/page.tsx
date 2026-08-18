import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getCallCenterManage } from "@/lib/callcenter-admin";
import { Icon } from "@/components/ui/Icon";
import { CallCenterManageClient } from "@/components/callcenter/CallCenterManageClient";

// Senior-manager structure console: pods, invites (floor managers + agents),
// served offices, and agent assignments.
export default async function CallCenterManagePage() {
  const user = await requireRole("CALL_CENTER_ADMIN");
  if (!user.organizationId) {
    return (
      <>
        <div className="topbar"><div className="tb-greet"><h1>Manage</h1></div></div>
        <div className="content"><div className="card card-pad"><p className="muted">No call center linked to your account.</p></div></div>
      </>
    );
  }
  const data = await getCallCenterManage(user.organizationId);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Structure &amp; team</h1>
          <p>Pods, phone agents, floor managers, and the practices you call for.</p>
        </div>
        <div className="tb-right"><Link className="btn btn-ghost" href="/callcenter"><Icon name="arrow" size={14} style={{ transform: "rotate(180deg)" }} /> Overview</Link></div>
      </div>
      <div className="content">
        <CallCenterManageClient data={data} />
      </div>
    </>
  );
}
