import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { relativeShort } from "@/lib/format";
import { ASSESSMENT_STATUS } from "./status";

type Row = { id: string; practiceName: string; contactName: string; email: string; status: string; createdAt: Date; office: { isProspect: boolean } };

// Free assessments: the ones waiting for a review first (a personal email
// address — a super admin approves them), then the latest few.
export default async function PlatformAssessmentsPage() {
  await requireRole("PLATFORM_ADMIN"); // Super-Admin only
  const select = { id: true, practiceName: true, contactName: true, email: true, status: true, createdAt: true, office: { select: { isProspect: true } } } as const;
  const [pending, recent] = await Promise.all([
    prisma.setterAudit.findMany({ where: { status: "PENDING_APPROVAL" }, select, orderBy: { createdAt: "desc" } }),
    prisma.setterAudit.findMany({ where: { status: { not: "PENDING_APPROVAL" } }, select, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  const list = (rows: Row[], empty: string) => (
    <>
      {rows.length === 0 && <p className="muted" style={{ fontSize: 14 }}>{empty}</p>}
      {rows.map((a, i) => {
        const status = ASSESSMENT_STATUS[a.status] ?? { label: a.status, chip: "" };
        return (
          <Link key={a.id} href={`/platform/assessments/${a.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none", color: "inherit", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.practiceName}</div>
              <div className="muted" style={{ fontSize: 12, overflowWrap: "anywhere" }}>{a.contactName} · {a.email}{a.office.isProspect ? "" : " · account created"}</div>
            </div>
            <span className={"chip " + status.chip} style={{ padding: "2px 9px", fontSize: 11, flex: "none" }}>{status.label}</span>
            <span className="muted" style={{ fontSize: 12, flex: "none", minWidth: 64, textAlign: "right" }}>{relativeShort(a.createdAt)}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Assessments</h1>
          <p>Free Setter Audits. A personal email address waits here for a review; approving it emails the prospect their link.</p>
        </div>
      </div>
      <div className="content" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="card card-pad rise">
          <h3 style={{ fontSize: 18, marginBottom: 10 }}>Waiting for review{pending.length ? ` · ${pending.length}` : ""}</h3>
          {list(pending, "Nothing waiting for review.")}
        </div>
        <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
          <h3 style={{ fontSize: 18, marginBottom: 10 }}>Latest</h3>
          {list(recent, "No assessments yet.")}
        </div>
      </div>
    </>
  );
}
