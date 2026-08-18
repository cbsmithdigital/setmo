import { requireRole } from "@/lib/auth";
import { listCallCenters } from "@/lib/callcenter-admin";
import { NewCallCenterForm } from "@/components/platform/NewCallCenterForm";

export default async function PlatformCallCentersPage() {
  await requireRole("PLATFORM_ADMIN");
  const centers = await listCallCenters();

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Call centers</h1>
          <p>Create a call-center tenant and invite its senior manager.</p>
        </div>
      </div>
      <div className="content" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <NewCallCenterForm />

        <div className="card card-pad">
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>Existing ({centers.length})</h3>
          {centers.length === 0 ? (
            <p className="muted" style={{ fontSize: 13.5 }}>No call centers yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {centers.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{c.pods} pod{c.pods === 1 ? "" : "s"} · {c.agents} agent{c.agents === 1 ? "" : "s"} · {c.offices} office{c.offices === 1 ? "" : "s"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
