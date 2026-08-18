import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getServedOfficeAgentDetail } from "@/lib/callcenter";
import { Ring } from "@/components/ui/widgets";
import { Icon } from "@/components/ui/Icon";
import { relativeShort } from "@/lib/format";

// A served practice viewing a call-center agent who calls for them — scoped to
// THIS office's calls only (getServedOfficeAgentDetail returns null otherwise, so
// an admin can't reach an agent who never worked their account). Read-only.
export default async function ServedAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const { id } = await params;
  const a = await getServedOfficeAgentDetail(user.officeId!, id);
  if (!a) notFound();
  const skills = [...a.skills].sort((x, y) => y.avg - x.avg);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{a.name}</h1>
          <p>Call center agent · {a.sessions} calls for your office · {a.trainingMin} min trained</p>
        </div>
        <div className="tb-right">
          <Link className="btn btn-ghost" href="/office"><Icon name="arrow" size={14} style={{ transform: "rotate(180deg)" }} /> Back</Link>
        </div>
      </div>

      <div className="content">
        <div className="grid g-2" style={{ gridTemplateColumns: ".8fr 1.2fr", marginBottom: 18 }}>
          <div className="card card-pad rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div className="eyebrow">On your account</div>
            <Ring value={a.overall} size={150} label="avg score" />
          </div>
          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>Strengths &amp; growth areas</h3>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Skill scores on the calls this agent ran for your practice.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {skills.map((s) => {
                const low = s.avg < 3.6;
                return (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 150, fontSize: 13, color: "var(--text-2)" }}>{s.name}</div>
                    <div style={{ flex: 1, height: 8, borderRadius: 99, background: "var(--s3)", overflow: "hidden" }}>
                      <div style={{ width: `${(s.avg / 5) * 100}%`, height: "100%", borderRadius: 99, background: low ? "var(--amber)" : "var(--grad-mint)" }} />
                    </div>
                    <div style={{ width: 34, textAlign: "right", fontSize: 13, fontWeight: 700, color: low ? "var(--amber)" : "var(--text)" }}>{s.avg.toFixed(1)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
          <h3 style={{ fontSize: 17, marginBottom: 4 }}>Their calls for you</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Listen back to any practice call this agent ran on your account.</p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {a.recent.map((r) => (
              <Link key={r.id} href={`/results/${r.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.persona}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{relativeShort(r.startedAt)}</div>
                </div>
                <span className={"chip " + (r.score >= 4.3 ? "mint" : r.score < 3.7 ? "amber" : "")} style={{ padding: "2px 9px", fontFamily: "var(--font-lato)", fontWeight: 800 }}>{r.score ? r.score.toFixed(1) : "—"}</span>
                <Icon name="arrow" size={14} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
