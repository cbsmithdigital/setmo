import { requireRole, getActiveRole } from "@/lib/auth";
import { resolveAnalyticsRange } from "@/lib/queries";
import { getPodTeam, getPodSkillMatrix, getCenterTeam, getCenterSkillMatrix } from "@/lib/callcenter";
import { TeamTable } from "@/components/office/TeamTable";
import { ProgressControls } from "@/components/progress/ProgressControls";
import { SkillMatrix } from "@/components/office/SkillMatrix";
import { Icon } from "@/components/ui/Icon";

const PRESETS = [
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "60d", label: "60 days" },
  { key: "3m", label: "3 months" },
  { key: "all", label: "All time" },
];

// Call-center Team page — the office-admin team surface, adapted. A floor manager
// sees their pod; a senior manager sees every agent across all pods (each row
// tagged with its pod). Read-only roster (agent lifecycle lives in onboarding).
export default async function CallCenterTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireRole("CALL_CENTER_MANAGER", "CALL_CENTER_ADMIN");
  const sp = await searchParams;
  const { key, range, label } = resolveAnalyticsRange(sp);
  const senior = getActiveRole(user) === "CALL_CENTER_ADMIN";

  const scopeId = senior ? user.organizationId : user.callCenterPodId;
  if (!scopeId) {
    return (
      <>
        <div className="topbar"><div className="tb-greet"><h1>Team</h1></div></div>
        <div className="content"><div className="card card-pad muted" style={{ fontSize: 14 }}>Your account isn&apos;t linked to a {senior ? "call center" : "pod"} yet.</div></div>
      </>
    );
  }

  const [team, matrix] = senior
    ? await Promise.all([getCenterTeam(scopeId, range), getCenterSkillMatrix(scopeId, range)])
    : await Promise.all([getPodTeam(scopeId, range), getPodSkillMatrix(scopeId, range)]);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Team</h1>
          <p>Every agent&apos;s usage, score trend, and what to coach next{senior ? " · across every pod" : ""} · {label.toLowerCase()}.</p>
        </div>
        <div className="tb-right" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <ProgressControls active={key} from={sp.from} to={sp.to} basePath="/callcenter/team" presets={PRESETS} />
        </div>
      </div>
      <div className="content">
        <TeamTable rows={team} hrefBase="/callcenter/agent" noun="agent" />

        <div className="card card-pad rise" style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Icon name="target" size={15} />
            <h3 style={{ fontSize: 18 }}>Skill heatmap by agent</h3>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Averaged across this period. A warm column flags a skill {senior ? "the whole center" : "the whole pod"} needs; a warm row is one agent to coach.
          </p>
          <SkillMatrix skills={matrix.skills} rows={matrix.rows} rowLabel="Agent" hrefBase="/callcenter/agent" />
        </div>
      </div>
    </>
  );
}
