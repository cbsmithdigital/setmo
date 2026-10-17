import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isFreeEmailDomain } from "@/lib/audit";
import { relativeShort } from "@/lib/format";
import { ApproveAssessment } from "../ApproveAssessment";
import { ASSESSMENT_STATUS } from "../status";

// Gmail ignores dots and anything after "+", and most providers ignore "+tags",
// so one inbox can look like many addresses. Normalizing lets the review spot an
// alias of an earlier free assessment.
function inboxKey(email: string) {
  const [local = "", rawDomain = ""] = email.trim().toLowerCase().split("@");
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  const base = local.split("+")[0];
  return `${domain === "gmail.com" ? base.replace(/\./g, "") : base}@${domain}`;
}

// One free assessment — where the "needs a review" alert's button lands. A
// super admin approves it here (a POST); opening the link never changes anything.
export default async function PlatformAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("PLATFORM_ADMIN"); // Super-Admin only
  const { id } = await params;
  const a = await prisma.setterAudit.findUnique({
    where: { id },
    select: { id: true, practiceName: true, contactName: true, email: true, emailDomain: true, status: true, createdAt: true, office: { select: { isProspect: true } } },
  });
  if (!a) notFound();
  // Earlier assessments from the same inbox (aliases included) or under the same practice name.
  const key = inboxKey(a.email);
  const domains = a.emailDomain === "gmail.com" || a.emailDomain === "googlemail.com" ? ["gmail.com", "googlemail.com"] : [a.emailDomain];
  const earlier = (
    await prisma.setterAudit.findMany({
      where: { id: { not: a.id }, OR: [{ emailDomain: { in: domains } }, { practiceName: { equals: a.practiceName, mode: "insensitive" } }] },
      select: { id: true, email: true, practiceName: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    })
  ).filter((e) => inboxKey(e.email) === key || e.practiceName.trim().toLowerCase() === a.practiceName.trim().toLowerCase());
  const status = ASSESSMENT_STATUS[a.status] ?? { label: a.status, chip: "" };
  const pending = a.status === "PENDING_APPROVAL";
  const live = a.status === "ACTIVE";
  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", gap: 14, padding: "9px 0", borderTop: "1px solid var(--line-soft)", fontSize: 14 }}>
      <span className="muted" style={{ width: 110, flex: "none" }}>{label}</span>
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <Link className="btn btn-ghost" href="/platform/assessments" style={{ marginBottom: 12, padding: "7px 14px", fontSize: 13.5 }}>← Assessments</Link>
          <h1>{a.practiceName}</h1>
          <p>
            Free Setter Audit · <span className={"chip " + status.chip} style={{ padding: "2px 9px", fontSize: 11 }}>{status.label}</span>
          </p>
        </div>
      </div>
      <div className="content">
        <div className="card card-pad rise" style={{ maxWidth: 640 }}>
          <h3 style={{ fontSize: 18, marginBottom: 6 }}>{pending ? "Waiting for your review" : "The request"}</h3>
          {pending && (
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>
              {isFreeEmailDomain(a.emailDomain)
                ? "They confirmed this email, but it's a personal address, so the call stays closed until it's approved."
                : "They confirmed this email, and it's waiting for a review before the call opens."}{" "}
              Approving opens it, exactly as a practice email would, and emails them their link.
            </p>
          )}
          {row("Practice", a.practiceName)}
          {row("Name", a.contactName)}
          {row(
            "Email",
            <>
              {a.email}
              {isFreeEmailDomain(a.emailDomain) && <span className="chip" style={{ padding: "1px 8px", fontSize: 11, marginLeft: 8 }}>Personal address</span>}
            </>
          )}
          {row("Started", `${a.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Denver" })} MT · ${relativeShort(a.createdAt)}`)}
          {row("Account", a.office.isProspect ? "Not created yet" : "Created (claimed)")}
          {row(
            "Earlier",
            earlier.length === 0 ? (
              <span className="muted">No other assessment from this inbox or practice name</span>
            ) : (
              <span style={{ display: "grid", gap: 4 }}>
                {earlier.slice(0, 8).map((e) => (
                  <Link key={e.id} href={`/platform/assessments/${e.id}`} style={{ color: "var(--purple-deep)" }}>
                    {e.email} · {e.practiceName} · {(ASSESSMENT_STATUS[e.status] ?? { label: e.status }).label} · {relativeShort(e.createdAt)}
                  </Link>
                ))}
                {earlier.length > 8 && <span className="muted">and {earlier.length - 8} more</span>}
              </span>
            ),
          )}
          <div style={{ marginTop: 16 }}>
            {live && <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>It&apos;s live. If they didn&apos;t get their link, you can email it to them again.</p>}
            <ApproveAssessment auditId={a.id} email={a.email} pending={pending} live={live} />
            {!pending && !live && <p className="muted" style={{ fontSize: 13 }}>Only an assessment waiting for review can be approved.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
