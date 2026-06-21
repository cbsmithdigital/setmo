import { requireRole } from "@/lib/auth";
import { getAuditLog } from "@/lib/platform";
import { relativeShort } from "@/lib/format";

const TAG: Record<string, string> = {
  "impersonate.start": "View as", "impersonate.stop": "Exit view-as",
  "minutes.grant": "Comp minutes", "access.activate": "Access on", "access.pause": "Access paused",
  "user.role": "Role change", "user.deactivate": "Deactivated", "user.reactivate": "Reactivated",
};

export default async function PlatformAuditPage() {
  await requireRole("PLATFORM_ADMIN", "SUPPORT");
  const log = await getAuditLog(150);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Audit log</h1>
          <p>Every sensitive admin action, newest first.</p>
        </div>
      </div>
      <div className="content">
        <div className="card rise" style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 640 }}>
            {log.length === 0 && <div className="card-pad muted" style={{ fontSize: 14 }}>No admin actions logged yet.</div>}
            {log.map((e, i) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                <span className="chip" style={{ padding: "2px 9px", fontSize: 11, flex: "none" }}>{TAG[e.action] ?? e.action}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14 }}>{e.summary}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{e.actorEmail ?? e.actorId}</div>
                </div>
                <span className="muted" style={{ fontSize: 12, flex: "none" }}>{relativeShort(e.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
