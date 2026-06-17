"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

type Participant = { id: string; name: string; progressPct: number; currentValue: number; achieved: boolean; rewardStatus: string };
export type GoalSummary = {
  id: string; title: string; targetText: string; rewardText: string; status: string; targetType: string;
  metric: string; window: string; periodKey: string | null; teamValue: number | null; teamAchieved: boolean;
  achievedCount: number; totalCount: number; participants: Participant[];
};
export type QueueItem = { participantId: string; setterName: string; goalTitle: string; targetText: string; rewardText: string; achievedAt: string | Date | null };

const METRICS: { v: string; label: string; teamOnly?: boolean; unit?: string }[] = [
  { v: "OVERALL_SCORE", label: "Overall score" },
  { v: "SKILL_SCORE", label: "Specific skill" },
  { v: "SET_RATE", label: "Set rate", unit: "%" },
  { v: "SHOW_RATE", label: "Show rate", unit: "%" },
  { v: "REPS", label: "Reps completed" },
  { v: "PRACTICE_HOURS", label: "Practice hours" },
  { v: "STREAK_WEEKS", label: "Weekly streak" },
  { v: "LEADERBOARD_RANK", label: "Leaderboard rank" },
  { v: "PERSONAL_BEST", label: "Personal best" },
  { v: "CONSULTS", label: "Consults booked", teamOnly: true },
  { v: "CASES", label: "Cases started", teamOnly: true },
  { v: "PRODUCTION", label: "Production $", teamOnly: true },
  { v: "MANUAL", label: "Manual milestone" },
];

function previewText(metric: string, comparator: string, target: string, skillName: string) {
  const label = metric === "SKILL_SCORE" ? skillName || "skill" : (METRICS.find((m) => m.v === metric)?.label.toLowerCase() ?? "metric");
  const unit = metric === "SET_RATE" || metric === "SHOW_RATE" ? "%" : metric === "PRODUCTION" ? " $" : "";
  const t = target || "—";
  if (comparator === "RANK_TOP") return `Reach top ${t} on ${label}`;
  if (comparator === "IMPROVE_BY") return `Improve ${label} by ${t}${unit}`;
  if (comparator === "MAINTAIN") return `Maintain ${label} at ${t}${unit}`;
  return `Reach ${t}${unit} ${label}`;
}

const REWARD_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending approval", cls: "amber" },
  APPROVED: { label: "Approved", cls: "purple" },
  SENT: { label: "Reward sent", cls: "mint" },
  FAILED: { label: "Send failed", cls: "amber" },
  DECLINED: { label: "Declined", cls: "" },
};

export function GoalsManager({
  scope,
  goals,
  queue,
  setters,
  offices,
  skills,
}: {
  scope: "OFFICE" | "GROUP";
  goals: GoalSummary[];
  queue: QueueItem[];
  setters: { id: string; name: string; officeName?: string }[];
  offices: { id: string; name: string }[];
  skills: { key: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // form state
  const [title, setTitle] = useState("");
  const [targetType, setTargetType] = useState<"SETTER" | "TEAM">("SETTER");
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? "");
  const [chosen, setChosen] = useState<string[]>([]);
  const [metric, setMetric] = useState("OVERALL_SCORE");
  const [skillKey, setSkillKey] = useState(skills[0]?.key ?? "");
  const [comparator, setComparator] = useState("REACH");
  const [targetValue, setTargetValue] = useState("");
  const [windowSel, setWindowSel] = useState("THIS_MONTH");
  const [recurrence, setRecurrence] = useState("NONE");
  const [minReps, setMinReps] = useState("5");
  const [rewardType, setRewardType] = useState<"GIFT_CARD" | "CUSTOM">("GIFT_CARD");
  const [rewardAmount, setRewardAmount] = useState("50");
  const [rewardLabel, setRewardLabel] = useState("");
  const [includeManager, setIncludeManager] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const metricOptions = METRICS.filter((m) => targetType === "TEAM" || !m.teamOnly);
  const skillName = skills.find((s) => s.key === skillKey)?.name ?? "";

  async function call(url: string, body: object, key: string) {
    setBusy(key);
    try {
      const res = await fetch(url, { method: url.includes("/participant/") || url === "/api/goals" ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Something went wrong"); return false; }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    setErr(null);
    const body = {
      title, targetType, officeId: targetType === "TEAM" ? officeId : undefined,
      setterIds: targetType === "SETTER" ? chosen : [],
      metric, skillKey: metric === "SKILL_SCORE" ? skillKey : undefined,
      comparator, targetValue: Number(targetValue) || 0,
      window: windowSel, recurrence, minQualifyingReps: Number(minReps) || 0,
      rewardType,
      rewardAmountCents: rewardType === "GIFT_CARD" ? Math.round((Number(rewardAmount) || 0) * 100) : undefined,
      rewardLabel: rewardType === "CUSTOM" ? rewardLabel : undefined,
      includeManager: targetType === "TEAM" ? includeManager : false,
    };
    const ok = await call("/api/goals", body, "create");
    if (ok) { setOpen(false); setTitle(""); setChosen([]); setTargetValue(""); setRewardLabel(""); }
  }

  const active = goals.filter((g) => g.status === "ACTIVE");
  const done = goals.filter((g) => g.status !== "ACTIVE");
  const fieldLab = { fontSize: 11.5, fontWeight: 700 as const, textTransform: "uppercase" as const, color: "var(--muted)", letterSpacing: ".02em", marginBottom: 5, display: "block" };

  return (
    <>
      {/* approval queue */}
      {queue.length > 0 && (
        <div className="card card-pad rise" style={{ marginBottom: 18, background: "linear-gradient(150deg,rgba(52,211,153,.12),var(--s2))" }}>
          <h3 style={{ fontSize: 17, marginBottom: 4 }}>🎉 Rewards to approve ({queue.length})</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>These goals were achieved. Approve to send the incentive, mark it sent if you handled it yourself, or decline.</p>
          {queue.map((q) => (
            <div key={q.participantId} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "11px 0", borderTop: "1px solid var(--line-soft)" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{q.setterName} · <span className="mint-text">{q.rewardText}</span></div>
                <div className="muted" style={{ fontSize: 12 }}>{q.goalTitle} — {q.targetText}</div>
              </div>
              <button className="btn btn-primary" disabled={busy === q.participantId} onClick={() => call(`/api/goals/participant/${q.participantId}/reward`, { action: "approve" }, q.participantId)} style={{ padding: "7px 14px", fontSize: 13 }}>
                {busy === q.participantId ? "…" : "Approve & send"}
              </button>
              <button className="btn btn-ghost" disabled={busy === q.participantId} onClick={() => call(`/api/goals/participant/${q.participantId}/reward`, { action: "marksent" }, q.participantId)} style={{ padding: "7px 12px", fontSize: 13 }}>Mark sent</button>
              <button className="btn btn-ghost" disabled={busy === q.participantId} onClick={() => call(`/api/goals/participant/${q.participantId}/reward`, { action: "decline" }, q.participantId)} style={{ padding: "7px 12px", fontSize: 13, color: "var(--muted)" }}>Decline</button>
            </div>
          ))}
        </div>
      )}

      {/* create */}
      <div style={{ marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={() => setOpen((o) => !o)} style={{ padding: "9px 18px" }}>
          <Icon name="target" size={15} /> {open ? "Close" : "New goal"}
        </button>
      </div>
      {open && (
        <div className="card card-pad rise" style={{ marginBottom: 18 }}>
          <div className="grid g-2" style={{ gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={fieldLab}>Goal name</label>
              <input className="input" placeholder="e.g. April objection push" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
            </div>

            <div>
              <label style={fieldLab}>Who</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={"btn " + (targetType === "SETTER" ? "btn-primary" : "btn-ghost")} onClick={() => setTargetType("SETTER")} style={{ padding: "7px 14px", fontSize: 13 }}>Individual setters</button>
                <button className={"btn " + (targetType === "TEAM" ? "btn-primary" : "btn-ghost")} onClick={() => setTargetType("TEAM")} style={{ padding: "7px 14px", fontSize: 13 }}>Whole team</button>
              </div>
            </div>
            {targetType === "TEAM" && scope === "GROUP" && (
              <div>
                <label style={fieldLab}>Practice</label>
                <select className="input" value={officeId} onChange={(e) => setOfficeId(e.target.value)} style={{ width: "100%" }}>
                  {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
            {targetType === "SETTER" && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={fieldLab}>Setters</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 130, overflowY: "auto" }}>
                  {setters.map((s) => {
                    const on = chosen.includes(s.id);
                    return (
                      <button key={s.id} className={"chip " + (on ? "mint" : "")} onClick={() => setChosen((c) => (on ? c.filter((x) => x !== s.id) : [...c, s.id]))} style={{ padding: "5px 11px", fontSize: 12.5, cursor: "pointer" }}>
                        {on ? "✓ " : ""}{s.name}{s.officeName ? ` · ${s.officeName}` : ""}
                      </button>
                    );
                  })}
                  {setters.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No setters available.</span>}
                </div>
              </div>
            )}

            <div>
              <label style={fieldLab}>Metric</label>
              <select className="input" value={metric} onChange={(e) => setMetric(e.target.value)} style={{ width: "100%" }}>
                {metricOptions.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
              </select>
            </div>
            {metric === "SKILL_SCORE" && (
              <div>
                <label style={fieldLab}>Skill</label>
                <select className="input" value={skillKey} onChange={(e) => setSkillKey(e.target.value)} style={{ width: "100%" }}>
                  {skills.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={fieldLab}>Comparator</label>
              <select className="input" value={comparator} onChange={(e) => setComparator(e.target.value)} style={{ width: "100%" }}>
                <option value="REACH">Reach (≥ target)</option>
                <option value="IMPROVE_BY">Improve by</option>
                <option value="MAINTAIN">Maintain at</option>
                <option value="RANK_TOP">Reach top N (rank)</option>
              </select>
            </div>
            <div>
              <label style={fieldLab}>Target</label>
              <input className="input" inputMode="decimal" placeholder="e.g. 4.0" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} style={{ width: "100%" }} />
            </div>

            <div>
              <label style={fieldLab}>Window</label>
              <select className="input" value={windowSel} onChange={(e) => setWindowSel(e.target.value)} style={{ width: "100%" }}>
                <option value="THIS_MONTH">This month</option>
                <option value="LAST_30D">Rolling 30 days</option>
                <option value="ONGOING">Ongoing</option>
              </select>
            </div>
            <div>
              <label style={fieldLab}>Repeat</label>
              <select className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value)} style={{ width: "100%" }}>
                <option value="NONE">One-time</option>
                <option value="MONTHLY">Every month</option>
              </select>
            </div>
            <div>
              <label style={fieldLab}>Min reps to qualify</label>
              <input className="input" inputMode="numeric" value={minReps} onChange={(e) => setMinReps(e.target.value)} style={{ width: "100%" }} />
            </div>

            <div>
              <label style={fieldLab}>Reward</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button className={"btn " + (rewardType === "GIFT_CARD" ? "btn-primary" : "btn-ghost")} onClick={() => setRewardType("GIFT_CARD")} style={{ padding: "7px 12px", fontSize: 13 }}>Gift card</button>
                <button className={"btn " + (rewardType === "CUSTOM" ? "btn-primary" : "btn-ghost")} onClick={() => setRewardType("CUSTOM")} style={{ padding: "7px 12px", fontSize: 13 }}>Custom</button>
              </div>
              {rewardType === "GIFT_CARD" ? (
                <input className="input" inputMode="numeric" placeholder="50" value={rewardAmount} onChange={(e) => setRewardAmount(e.target.value)} style={{ width: "100%" }} />
              ) : (
                <input className="input" placeholder="e.g. Half-day PTO" value={rewardLabel} onChange={(e) => setRewardLabel(e.target.value)} style={{ width: "100%" }} />
              )}
            </div>
            {targetType === "TEAM" && (
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                  <input type="checkbox" checked={includeManager} onChange={(e) => setIncludeManager(e.target.checked)} /> Reward the manager too
                </label>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={create} disabled={busy === "create" || !title} style={{ padding: "9px 18px" }}>
              {busy === "create" ? "Creating…" : "Create goal"}
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              {previewText(metric, comparator, targetValue, skillName)} → <b className="mint-text">{rewardType === "GIFT_CARD" ? `$${rewardAmount || "0"} gift card` : rewardLabel || "incentive"}</b>
            </span>
            {err && <span style={{ color: "var(--amber)", fontSize: 13 }}>{err}</span>}
          </div>
        </div>
      )}

      {/* active goals */}
      <h3 style={{ fontSize: 18, margin: "4px 0 12px" }}>Active goals</h3>
      {active.length === 0 && <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>No active goals yet — create one to start rewarding progress.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
        {active.map((g) => <GoalCard key={g.id} g={g} busy={busy} onArchive={() => call(`/api/goals/${g.id}`, { action: "archive" }, g.id)} />)}
      </div>

      {done.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, margin: "4px 0 12px" }} className="muted">History</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {done.map((g) => <GoalCard key={g.id} g={g} busy={busy} muted />)}
          </div>
        </>
      )}
    </>
  );
}

function GoalCard({ g, busy, onArchive, muted }: { g: GoalSummary; busy: string | null; onArchive?: () => void; muted?: boolean }) {
  const teamPct = g.participants[0]?.progressPct ?? 0;
  return (
    <div className="card card-pad" style={{ opacity: muted ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{g.title}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {g.targetText} · <span className="mint-text">{g.rewardText}</span> · {g.targetType === "TEAM" ? "whole team" : `${g.totalCount} setter${g.totalCount === 1 ? "" : "s"}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={"chip " + (g.achievedCount > 0 ? "mint" : "")} style={{ padding: "3px 10px", fontSize: 11.5 }}>
            {g.targetType === "TEAM" ? (g.teamAchieved ? "Achieved" : "In progress") : `${g.achievedCount}/${g.totalCount} hit`}
          </span>
          {onArchive && <button className="btn btn-ghost" disabled={busy === g.id} onClick={onArchive} style={{ padding: "5px 10px", fontSize: 12, color: "var(--muted)" }}>Archive</button>}
        </div>
      </div>

      {g.targetType === "TEAM" ? (
        <div style={{ marginTop: 12 }}>
          <Bar pct={teamPct} />
          <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>Team at {g.teamValue != null ? g.teamValue : "—"} · {teamPct}% to target{g.achievedCount > 0 ? ` · ${g.achievedCount} qualifying` : ""}</div>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 9 }}>
          {g.participants.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 120, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
              <div style={{ flex: 1 }}><Bar pct={p.progressPct} /></div>
              <div style={{ width: 42, textAlign: "right", fontSize: 12.5, fontFamily: "var(--font-lato)", fontWeight: 800 }}>{p.progressPct}%</div>
              {p.rewardStatus !== "NONE" && REWARD_BADGE[p.rewardStatus] && (
                <span className={"chip " + REWARD_BADGE[p.rewardStatus].cls} style={{ padding: "2px 8px", fontSize: 10.5 }}>{REWARD_BADGE[p.rewardStatus].label}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  const done = pct >= 100;
  return (
    <div style={{ height: 8, borderRadius: 99, background: "#181828", overflow: "hidden" }}>
      <div style={{ height: "100%", width: Math.min(100, Math.max(3, pct)) + "%", background: done ? "var(--grad-mint)" : "var(--grad)", borderRadius: 99 }} />
    </div>
  );
}
