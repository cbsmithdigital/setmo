import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export type SetterGoal = {
  id: string;
  title: string;
  targetText: string;
  rewardText: string;
  progressPct: number;
  achieved: boolean;
  rewardStatus: string;
  targetType: string;
  status: string;
};

const REWARD_NOTE: Record<string, string> = {
  PENDING: "Reward on the way",
  APPROVED: "Reward approved",
  SENT: "Reward sent 🎉",
  FAILED: "Reward processing",
};

function Row({ g }: { g: SetterGoal }) {
  const done = g.achieved || g.progressPct >= 100;
  return (
    <div style={{ padding: "12px 0", borderTop: "1px solid var(--line-soft)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{g.title}</div>
        <div className="mint-text" style={{ fontSize: 13, fontWeight: 700 }}>{g.rewardText}</div>
      </div>
      <div className="muted" style={{ fontSize: 12, margin: "2px 0 8px" }}>{g.targetText}{g.targetType === "TEAM" ? " · team goal" : ""}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 99, background: "#181828", overflow: "hidden" }}>
          <div style={{ height: "100%", width: Math.min(100, Math.max(3, g.progressPct)) + "%", background: done ? "var(--grad-mint)" : "var(--grad)", borderRadius: 99 }} />
        </div>
        <div style={{ width: 42, textAlign: "right", fontFamily: "var(--font-lato)", fontWeight: 800, fontSize: 13 }}>{g.progressPct}%</div>
      </div>
      {g.achieved && REWARD_NOTE[g.rewardStatus] && (
        <div className="chip mint" style={{ marginTop: 8, padding: "2px 9px", fontSize: 11 }}>{REWARD_NOTE[g.rewardStatus]}</div>
      )}
    </div>
  );
}

export function SetterGoals({ goals, compact }: { goals: SetterGoal[]; compact?: boolean }) {
  const active = goals.filter((g) => g.status === "ACTIVE");
  const shown = compact ? active.slice(0, 2) : goals;
  if (active.length === 0 && compact) return null;

  return (
    <div className="card card-pad rise" style={compact ? { marginBottom: 18 } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="flame" size={16} /> {compact ? "Your goals" : "Goals & rewards"}
        </h3>
        {compact && <Link className="muted" href="/goals" style={{ fontSize: 13, fontWeight: 600 }}>View all →</Link>}
      </div>
      {shown.length === 0 ? (
        <p className="muted" style={{ fontSize: 13.5, marginTop: 10 }}>No goals yet — your manager will set targets you can earn rewards for.</p>
      ) : (
        <div>{shown.map((g) => <Row key={g.id} g={g} />)}</div>
      )}
    </div>
  );
}
