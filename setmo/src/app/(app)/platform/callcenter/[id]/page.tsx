import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCallCenterManage } from "@/lib/callcenter-admin";
import { CallCenterManageClient } from "@/components/callcenter/CallCenterManageClient";
import { UserActions } from "@/components/platform/AdminActions";
import { Icon } from "@/components/ui/Icon";

const ROLE_LABEL: Record<string, string> = {
  CALL_CENTER_ADMIN: "Senior manager",
  CALL_CENTER_MANAGER: "Floor manager",
  SETTER: "Phone agent",
};

// Super-admin drill-in for one call center: full structure console (pods,
// floor managers, agents, served offices) plus per-user invite/actions —
// so a center can be built out before its senior manager ever logs in.
export default async function PlatformCallCenterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("PLATFORM_ADMIN");
  const { id } = await params;
  const org = await prisma.organization.findFirst({ where: { id, type: "CALL_CENTER" }, select: { id: true, name: true } });
  if (!org) notFound();

  const data = await getCallCenterManage(org.id);
  const people = [
    ...data.managers.map((m) => ({ ...m, roleLabel: ROLE_LABEL[m.role] ?? m.role, sub: m.podName || "Whole center" })),
    ...data.agents.map((a) => ({ id: a.id, name: a.name, email: a.email, role: "SETTER", status: a.status, roleLabel: ROLE_LABEL.SETTER, sub: a.podName || "—" })),
  ];

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <Link className="btn btn-ghost" href="/platform/callcenter" style={{ marginBottom: 12, padding: "7px 14px", fontSize: 13.5 }}>
            ← Call centers
          </Link>
          <h1>{data.name}</h1>
          <p>Build the structure and manage its people — pods, floor managers, phone agents, served practices.</p>
        </div>
      </div>

      <div className="content" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* People + invite status — resend invites, view as, deactivate. */}
        <div className="card card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Icon name="team" size={16} />
            <h3 style={{ fontSize: 17 }}>Users</h3>
          </div>
          {people.length === 0 ? (
            <p className="muted" style={{ fontSize: 13.5 }}>No one yet — send the first invite below.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {people.map((u, i) => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid var(--line-soft)" : "none", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name || u.email}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{u.email} · {u.roleLabel} · {u.sub}</div>
                  </div>
                  <span className={"chip " + (u.status === "ACTIVE" ? "mint" : u.status === "INVITED" ? "" : "amber")} style={{ fontSize: 11 }}>{u.status}</span>
                  <UserActions userId={u.id} status={u.status} role={u.role} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Full structure console (same one the senior manager uses), org-scoped. */}
        <CallCenterManageClient data={data} orgId={org.id} />
      </div>
    </>
  );
}
