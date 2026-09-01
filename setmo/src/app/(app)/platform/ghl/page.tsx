import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GhlConnectForm, GhlMapUserForm, GhlToggleButton } from "@/components/platform/GhlAdmin";
import { relativeShort, fullName } from "@/lib/format";

// Super-admin console for the GHL live-call integrations: connect a sub-account
// to a practice, hand over the webhook URL, map GHL agents to SetMo users, and
// watch the inbound pipeline (held/unmapped/errored events).
export default async function PlatformGhlPage() {
  await requireRole("PLATFORM_ADMIN");

  const [integrations, offices, maps, recentEvents] = await Promise.all([
    prisma.ghlIntegration.findMany({ include: { office: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.office.findMany({ where: { isProspect: false, ghlIntegration: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ghlUserMap.findMany({ include: { user: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.ghlInboundEvent.findMany({ orderBy: { createdAt: "desc" }, take: 25, include: { integration: { select: { ghlLocationId: true, office: { select: { name: true } } } } } }),
  ]);
  const unmapped = recentEvents.filter((e) => e.status === "UNMAPPED_USER");
  const statusColor = (s: string) => (s === "PROCESSED" ? "var(--mint)" : s === "UNMAPPED_USER" ? "var(--amber)" : s === "ERROR" ? "var(--rose)" : "var(--muted)");

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>GHL live calls</h1>
          <p>Connect client GHL sub-accounts, map agents, and watch the ingestion pipeline.</p>
        </div>
      </div>

      <div className="content">
        {/* connect */}
        <div className="card card-pad rise" style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 17, marginBottom: 4 }}>Connect a sub-account</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            After connecting, add a GHL Workflow (Call Status: completed → Custom Webhook, POST) pointing at the webhook URL shown on the row below. The webhook must include location, user, contact_id, and customData.transcript — and NO contact name/email/phone.
          </p>
          <GhlConnectForm offices={offices} />
        </div>

        {/* integrations */}
        <div className="card card-pad rise" style={{ marginBottom: 18, animationDelay: ".05s" }}>
          <h3 style={{ fontSize: 17, marginBottom: 10 }}>Connected sub-accounts</h3>
          {integrations.length === 0 && <p className="muted" style={{ fontSize: 14 }}>None yet.</p>}
          {integrations.map((i, idx) => (
            <div key={i.id} style={{ padding: "12px 4px", borderTop: idx ? "1px solid var(--line-soft)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{i.office.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>location {i.ghlLocationId} · {i.pitToken ? "PIT stored" : "no PIT"} · last call {i.lastCallAt ? relativeShort(i.lastCallAt) : "never"}</div>
                </div>
                <span className={"chip " + (i.status === "ACTIVE" ? "mint" : "amber")} style={{ fontSize: 11 }}>{i.status}</span>
                <GhlToggleButton integrationId={i.id} status={i.status} />
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6, wordBreak: "break-all" }}>
                Webhook: https://setmo.growdental.ai/api/webhooks/ghl?key={i.webhookSecret}
              </div>
            </div>
          ))}
        </div>

        <div className="grid g-2" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 18 }}>
          {/* unmapped + user maps */}
          <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Agent mapping</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>GHL user → SetMo user. Held calls replay automatically when you map.</p>
            {unmapped.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--amber)", marginBottom: 8 }}>Needs mapping ({unmapped.length} held call{unmapped.length === 1 ? "" : "s"})</div>
                {[...new Set(unmapped.map((e) => e.ghlUserId).filter(Boolean))].map((gid) => (
                  <div key={gid} style={{ marginBottom: 8 }}><GhlMapUserForm ghlUserId={gid!} /></div>
                ))}
              </div>
            )}
            <div style={{ marginBottom: 12 }}><GhlMapUserForm /></div>
            {maps.map((m, i) => (
              <div key={m.id} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "6px 0", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                <span className="muted" style={{ width: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{m.ghlUserId}</span>
                <span>→ {fullName(m.user.firstName, m.user.lastName) || m.user.email}</span>
              </div>
            ))}
          </div>

          {/* recent events */}
          <div className="card card-pad rise" style={{ animationDelay: ".15s" }}>
            <h3 style={{ fontSize: 17, marginBottom: 10 }}>Recent inbound calls</h3>
            {recentEvents.length === 0 && <p className="muted" style={{ fontSize: 14 }}>Nothing yet.</p>}
            {recentEvents.map((e, i) => (
              <div key={e.id} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--line-soft)" : "none", fontSize: 12.5 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontWeight: 700, color: statusColor(e.status) }}>{e.status}</span>
                  <span className="muted">{e.integration.office.name}</span>
                  <span className="muted" style={{ marginLeft: "auto" }}>{relativeShort(e.createdAt)}</span>
                </div>
                {e.note && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{e.note}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
