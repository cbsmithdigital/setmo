import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, getActiveRole } from "@/lib/auth";
import { getAgentDetail } from "@/lib/callcenter";
import { Ring } from "@/components/ui/widgets";
import { Icon } from "@/components/ui/Icon";
import { relativeShort } from "@/lib/format";

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("CALL_CENTER_ADMIN", "CALL_CENTER_MANAGER");
  const { id } = await params;
  const a = await getAgentDetail(id);
  if (!a) notFound();

  // Ownership: senior sees any agent in their call center; a floor manager only
  // agents in their own pod.
  const senior = getActiveRole(user) === "CALL_CENTER_ADMIN";
  const canView = senior ? a.orgId === user.organizationId : a.podId != null && a.podId === user.callCenterPodId;
  if (!canView) notFound();

  const skills = [...a.skills].sort((x, y) => y.avg - x.avg);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{a.name}</h1>
          <p>{a.podName} · {a.sessions} reps · {a.trainingMin} min trained · {a.perOffice.length} office{a.perOffice.length === 1 ? "" : "s"}</p>
        </div>
        <div className="tb-right">
          <Link className="btn btn-ghost" href="/callcenter"><Icon name="arrow" size={14} style={{ transform: "rotate(180deg)" }} /> Back</Link>
        </div>
      </div>

      <div className="content">
        <div className="grid g-2" style={{ gridTemplateColumns: ".8fr 1.2fr", marginBottom: 18 }}>
          {/* overall + skills */}
          <div className="card card-pad rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div className="eyebrow">Overall</div>
            <Ring value={a.overall} size={150} label="avg score" />
          </div>
          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <h3 style={{ fontSize: 17, marginBottom: 12 }}>Skill profile</h3>
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

        {/* per-office breakdown */}
        <div className="card card-pad rise" style={{ marginBottom: 18, animationDelay: ".1s" }}>
          <h3 style={{ fontSize: 17, marginBottom: 4 }}>By office</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>How this agent performs on each account they call for.</p>
          <div className="grid g-3">
            {a.perOffice.map((o) => (
              <div key={o.officeId} className="card card-pad" style={{ background: "var(--s2)" }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{o.officeName}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="grad-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 26 }}>{o.avg ? o.avg.toFixed(1) : "—"}</span>
                  <span className="muted" style={{ fontSize: 12 }}>avg</span>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{o.sessions} reps · {o.trainingMin}m · {o.last ? relativeShort(o.last) : "—"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* recent calls — reviewable */}
        <div className="card card-pad rise" style={{ animationDelay: ".15s" }}>
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>Recent calls</h3>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {a.recent.map((r) => (
              <Link key={r.id} href={`/results/${r.id}`} className="cc-agent-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.persona}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{r.officeName} · {relativeShort(r.startedAt)}</div>
                </div>
                <span className={"chip " + (r.score >= 4.3 ? "mint" : r.score < 3.7 ? "amber" : "")} style={{ padding: "2px 9px", fontFamily: "var(--font-lato)", fontWeight: 800 }}>{r.score ? r.score.toFixed(1) : "—"}</span>
                <Icon name="arrow" size={14} />
              </Link>
            ))}
            {a.recent.length === 0 && <p className="muted" style={{ fontSize: 13.5, paddingTop: 10 }}>No calls yet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
