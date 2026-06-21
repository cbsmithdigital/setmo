import { requireRole } from "@/lib/auth";
import { getViewerPartner, getPartnerDashboard } from "@/lib/partner-portal";
import { CopyLink, InviteMember } from "@/components/partner/PartnerWidgets";

export default async function PartnerTeamPage() {
  const user = await requireRole("PARTNER_ADMIN");
  const ctx = await getViewerPartner(user);
  if (!ctx) return <div className="content"><div className="card card-pad muted">No partner account linked.</div></div>;
  const d = await getPartnerDashboard(ctx.partnerId, null);
  if (!d) return <div className="content"><div className="card card-pad muted">Partner not found.</div></div>;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://setmo.growdental.ai";

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Team &amp; codes</h1>
          <p>Add reps under {d.partner.name}. Each gets their own link and tracks their own referrals.</p>
        </div>
      </div>
      <div className="content">
        <div className="card card-pad rise" style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>Add a rep</h3>
          <InviteMember />
        </div>

        <div className="card card-pad rise">
          <h3 style={{ fontSize: 18, marginBottom: 12 }}>Reps ({d.members.length})</h3>
          {d.members.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No reps yet.</p>}
          {d.members.map((m, i) => (
            <div key={m.id} style={{ padding: "12px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: m.code ? 8 : 0 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name || m.email}{m.status !== "ACTIVE" && <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}> · {m.status.toLowerCase()}</span>}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{m.email}</div>
                </div>
              </div>
              {m.code && <CopyLink link={`${appUrl}/audit?ref=${m.code}`} />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
