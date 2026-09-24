import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, getActiveRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPartnerDashboard, partnerLink } from "@/lib/partner-portal";
import { getMinuteBalance } from "@/lib/usage";
import { fullName, relativeShort } from "@/lib/format";
import { UserActions } from "@/components/platform/AdminActions";
import { CopyLink } from "@/components/partner/PartnerWidgets";
import { DemoResetButton, CommissionsToggle } from "@/components/platform/PartnerDetailActions";

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "mint" },
  signed_up: { label: "Signed up", cls: "purple" },
  prospect: { label: "Took the audit", cls: "" },
};

// One partner, in full: their tracking link, every practice they've referred (and
// which rep brought it in), their team's logins, and their demo account.
export default async function PlatformPartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("PLATFORM_ADMIN", "SUPPORT");
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id }, include: { codes: true } });
  if (!partner) notFound();
  const d = await getPartnerDashboard(id, null);
  if (!d) notFound();
  const isSuper = getActiveRole(user) === "PLATFORM_ADMIN";

  const people = await prisma.user.findMany({
    where: { partnerId: id },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true, memberships: { select: { role: true } } },
    orderBy: { createdAt: "asc" },
  });
  const orgCode = (partner.codes.find((c) => !c.memberUserId) ?? partner.codes[0])?.code ?? null;

  const demoOffices = partner.demoOrganizationId
    ? await prisma.office.findMany({ where: { organizationId: partner.demoOrganizationId, isDemo: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } })
    : [];
  const demoBalances = await Promise.all(demoOffices.map(async (o) => ({ ...o, balance: (await getMinuteBalance(o.id)).remainingMin })));
  const lastReset = await prisma.adminAuditLog.findFirst({ where: { action: "partner.demo", targetId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <Link className="btn btn-ghost" href="/platform/partners" style={{ marginBottom: 12, padding: "7px 14px", fontSize: 13.5 }}>← Partners</Link>
          <h1>{partner.name}</h1>
          <p>
            {partner.contactName} · {partner.email} · {partner.track === "DISTRIBUTION" ? "Distribution" : "Referral"} ·{" "}
            {partner.commissionsEnabled ? "earning commission" : "tracking only — no payouts"}
          </p>
        </div>
        <div className="tb-right">{isSuper && <CommissionsToggle partnerId={id} enabled={partner.commissionsEnabled} />}</div>
      </div>

      <div className="content" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="grid g-2">
          <div className="card card-pad">
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Tracking link</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
              Any practice that signs up or runs the free audit after arriving on this link (or a rep&apos;s link) is credited to {partner.name}.
            </p>
            {orgCode ? <CopyLink link={partnerLink(orgCode)} /> : <p className="muted" style={{ fontSize: 13 }}>No code yet.</p>}
            <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 13 }}>
              <span><b>{d.counts.referred}</b> <span className="muted">referred</span></span>
              <span><b>{d.counts.active}</b> <span className="muted">active</span></span>
              <span><b>{d.counts.signedUp}</b> <span className="muted">signed up</span></span>
              <span><b>{d.counts.assessing}</b> <span className="muted">took the audit</span></span>
            </div>
          </div>

          <div className="card card-pad">
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Demo account</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
              Riverbend Dental Group — two practices with realistic team history. Everyone on {partner.name}&apos;s team can switch into it. Kept out of revenue, metrics and the leaderboard.
            </p>
            {demoBalances.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {demoBalances.map((o) => (
                  <div key={o.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                    <Link href={`/platform/accounts/${partner.demoOrganizationId}`}>{o.name}</Link>
                    <span style={{ color: o.balance <= 100 ? "var(--amber)" : undefined }}>{o.balance.toLocaleString()} min left</span>
                  </div>
                ))}
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Add minutes from the <Link href={`/platform/accounts/${partner.demoOrganizationId}`}>account page</Link>.
                  {lastReset ? ` Last reset ${relativeShort(lastReset.createdAt)}.` : ""}
                </p>
              </div>
            )}
            <DemoResetButton partnerId={id} hasDemo={demoBalances.length > 0} />
          </div>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 17, marginBottom: 10 }}>Team logins ({people.length})</h3>
          {people.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>No logins yet.</p>}
          {people.map((u, i) => {
            const isAdmin = u.role === "PARTNER_ADMIN" || u.memberships.some((m) => m.role === "PARTNER_ADMIN");
            return (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    {fullName(u.firstName, u.lastName) || u.email}
                    <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · {isAdmin ? "partner admin" : "sales rep"}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {u.email} · {u.status === "INVITED" ? "invite not accepted yet" : u.status.toLowerCase()}
                  </div>
                </div>
                <UserActions userId={u.id} status={u.status} role={u.role} />
              </div>
            );
          })}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            &quot;Resend invite&quot; sends the partner setup email. Reps are added by the partner admin from their own Team page.
          </p>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 17, marginBottom: 10 }}>Referred practices ({d.accounts.length})</h3>
          {d.accounts.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>None yet.</p>}
          {d.accounts.map((a, i) => {
            const st = STATUS[a.status] ?? { label: a.status, cls: "" };
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {a.status === "prospect" ? a.name : <Link href={`/platform/accounts/${a.id}`}>{a.name}</Link>}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {a.rep ? `via ${a.rep}` : `via ${partner.name}`} · {new Date(a.referredAt).toLocaleDateString()}
                  </div>
                </div>
                <span className={"chip " + st.cls} style={{ padding: "2px 9px", fontSize: 11 }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
