import { requireRole, getActiveRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getLiveCalls } from "@/lib/ghl";
import { groupScope } from "@/lib/group";
import { LiveCallsList } from "@/components/LiveCallsList";
import { Icon } from "@/components/ui/Icon";

// Manager view of REAL calls ingested from the practice's phone system (GHL) —
// scored with the live rubric + outcome analysis. Separate from practice
// analytics by design. Office admins see their office; a GROUP_ADMIN every
// office in their org; a Multi Practice Admin their assigned subset.
export default async function OfficeLiveCallsPage() {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "MULTI_PRACTICE_ADMIN", "PLATFORM_ADMIN");
  const role = getActiveRole(user);

  let officeIds: string[] = [];
  if (role === "MULTI_PRACTICE_ADMIN") {
    const { officeIds: scoped } = await groupScope(user);
    officeIds = scoped ?? [];
  } else if (role === "GROUP_ADMIN" && user.organizationId) {
    officeIds = (await prisma.office.findMany({ where: { organizationId: user.organizationId }, select: { id: true } })).map((o) => o.id);
  } else if (user.officeId) {
    officeIds = [user.officeId];
  }

  if (officeIds.length === 0) {
    return (
      <>
        <div className="topbar"><div className="tb-greet"><h1>Live calls</h1></div></div>
        <div className="content"><div className="card card-pad muted" style={{ fontSize: 14 }}>No practices on your account yet.</div></div>
      </>
    );
  }

  const rows = await getLiveCalls({ officeIds });

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Live calls</h1>
          <p>Real calls from your phone system — scored, with outcome analysis and coaching. Kept separate from practice stats.</p>
        </div>
        <div className="tb-right"><span className="chip"><Icon name="shield" size={13} /> PII-scrubbed transcripts</span></div>
      </div>
      <div className="content">
        <LiveCallsList rows={rows} showOffice={officeIds.length > 1} />
      </div>
    </>
  );
}
