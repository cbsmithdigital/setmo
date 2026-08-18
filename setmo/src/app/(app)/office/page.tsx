import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getOfficeOverview, currentPeriod, getOutcome, getOnboarding } from "@/lib/office";
import { OnboardingChecklist } from "@/components/office/OnboardingChecklist";
import { StatTile } from "@/components/ui/StatTile";
import { Sparkline, Delta } from "@/components/ui/widgets";
import { Icon } from "@/components/ui/Icon";
import { InviteButton } from "@/components/office/InviteButton";
import { OutcomesCard } from "@/components/office/OutcomesCard";
import { OutcomesInsight } from "@/components/office/OutcomesInsight";
import { getOfficeOutcomeFunnel } from "@/lib/outcomes";
import { getTrainingImpact } from "@/lib/coaching";
import { getServedOfficeAgents } from "@/lib/callcenter";
import { getInsight } from "@/lib/insights";
import { SettyInsight } from "@/components/coach/SettyInsight";
import { relativeShort } from "@/lib/format";

function trendColor(status: string) {
  return status === "watch" ? "#fbbf24" : status === "new" ? "#a78bfa" : "#34d399";
}

export default async function OfficeOverviewPage() {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const o = await getOfficeOverview(user.officeId!);
  const period = currentPeriod();
  const [outcome, funnel, insight, onboarding, impact, servedAgents] = await Promise.all([
    getOutcome(user.officeId!, period.label),
    getOfficeOutcomeFunnel(user.officeId!, period.label),
    getInsight("OFFICE", user.officeId!),
    getOnboarding(user.officeId!),
    getTrainingImpact(user.officeId!),
    getServedOfficeAgents(user.officeId!),
  ]);
  const { purchasedMin, usedMin, remainingMin } = o.allowance;
  const poolPct = purchasedMin > 0 ? Math.round((usedMin / purchasedMin) * 100) : 0;
  const low = purchasedMin > 0 && remainingMin <= purchasedMin * 0.2;

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>{o.practiceName}</h1>
          <p>
            {o.city ? `${o.city} · ` : ""}
            {o.activeSetters} active setter{o.activeSetters === 1 ? "" : "s"}
          </p>
        </div>
        <div className="tb-right" style={{ display: "flex", gap: 10 }}>
          <Link className="btn btn-ghost" href="/office/billing"><Icon name="card" size={16} /> Buy tokens</Link>
          <InviteButton allowGroupAdmin={!!user.organizationId && user.roles.some((r) => r === "GROUP_ADMIN" || r === "PLATFORM_ADMIN")} />
        </div>
      </div>

      <div className="content">
        <OnboardingChecklist data={onboarding} />
        <SettyInsight scope="OFFICE" subjectId={user.officeId!} insight={insight} />

        {impact.measured > 0 && (
          <div className="card card-pad rise" style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
              <h3 style={{ fontSize: 16 }}>Training impact <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>— did the skill move?</span></h3>
              {impact.avgDelta != null && (
                <span className={"chip " + (impact.avgDelta >= 0 ? "mint" : "amber")} style={{ padding: "3px 10px" }}>
                  avg {impact.avgDelta >= 0 ? "+" : ""}{impact.avgDelta} on targeted skills
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {impact.rows.slice(0, 5).map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                  <span><b>{r.setterName}</b> · {r.skillName} <span className="muted">after “{r.trainingTitle}”</span></span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                    <span className="muted">{r.baseline.toFixed(1)} → {r.after.toFixed(1)}</span>
                    <span className={"chip " + (r.delta >= 0 ? "mint" : "amber")} style={{ padding: "2px 8px" }}>{r.delta >= 0 ? "+" : ""}{r.delta}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {servedAgents.agents.length > 0 && (
          <div className="card card-pad rise" style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <h3 style={{ fontSize: 16 }}>Call center agents <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>— training for your practice</span></h3>
              {servedAgents.callCenterName && <span className="chip purple" style={{ padding: "3px 10px" }}>{servedAgents.callCenterName}</span>}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>How the agents calling for you are training. Open one to see their strengths and listen to their calls for your office.</p>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {servedAgents.agents.map((a) => (
                <Link key={a.id} href={`/office/agents/${a.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line-soft)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{a.sessions} reps · {a.trainingMin}m{a.weakSkill ? ` · focus: ${a.weakSkill}` : ""}{a.last ? ` · ${relativeShort(a.last)}` : ""}</div>
                  </div>
                  <span className={"chip " + (a.overall >= 4.3 ? "mint" : a.overall < 3.7 ? "amber" : "")} style={{ padding: "2px 9px", fontFamily: "var(--font-lato)", fontWeight: 800 }}>{a.overall ? a.overall.toFixed(1) : "—"}</span>
                  <Icon name="arrow" size={14} />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
          <StatTile lab="Team average" val={o.teamAvg.toFixed(1)} grad="var(--grad-mint)" sub="across active setters" />
          <StatTile lab="Active setters" val={String(o.activeSetters)} sub={`of ${o.seats} seats`} />
          <StatTile lab="Sessions this week" val={String(o.sessionsThisWeek)} sub="office-wide" subClass="up" />
          <div className="stat-tile">
            <div className="lab">Office skills · this month</div>
            {o.skills.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>No scored calls yet</div>
            ) : (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--mint)", marginBottom: 4 }}>Strongest</div>
                  {o.topSkills.map((s) => (
                    <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
                      <span style={{ color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                      <b className="mint-text" style={{ fontFamily: "var(--font-lato)" }}>{s.avg.toFixed(1)}</b>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--amber)", marginBottom: 4 }}>Needs work</div>
                  {o.gapSkills.map((s) => (
                    <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
                      <span style={{ color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                      <b style={{ fontFamily: "var(--font-lato)", color: "var(--amber)" }}>{s.avg.toFixed(1)}</b>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid g-2" style={{ gridTemplateColumns: "1.5fr 1fr", marginBottom: 18 }}>
          {/* team at a glance */}
          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ fontSize: 18 }}>Team at a glance</h3>
              <Link className="muted" style={{ fontSize: 13.5, fontWeight: 600 }} href="/office/team">
                View team →
              </Link>
            </div>
            {o.team.slice(0, 5).map((t, i) => (
              <Link
                key={t.id}
                href={`/office/team/${t.id}`}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 8px", width: "100%", textAlign: "left", borderTop: i ? "1px solid var(--line-soft)" : "none", borderRadius: 8 }}
              >
                <div className="lb-av" style={{ width: 36, height: 36, fontSize: 13 }}>{t.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{t.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t.sessions} session{t.sessions === 1 ? "" : "s"} · {relativeShort(t.lastActive)}
                  </div>
                </div>
                <Sparkline data={t.trend.length > 1 ? t.trend : [t.avg || 0, t.avg || 0]} w={72} h={28} color={trendColor(t.status)} fill={false} />
                <Delta v={t.delta} />
                <div className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 18, width: 38, textAlign: "right" }}>
                  {t.avg ? t.avg.toFixed(1) : "—"}
                </div>
              </Link>
            ))}
            {o.team.length === 0 && <p className="muted" style={{ fontSize: 14, padding: "8px" }}>No setters yet — invite your team to get started.</p>}
          </div>

          {/* pool + attention */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="card card-pad rise" style={{ animationDelay: ".1s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: 17 }}>Token balance</h3>
                <span className={"chip " + (low ? "amber" : "mint")} style={{ padding: "3px 10px" }}>
                  {purchasedMin === 0 ? "Buy tokens" : low ? "Running low" : "Healthy"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 6 }}>
                <span className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 42, lineHeight: 1 }}>
                  {(remainingMin * 10).toLocaleString()}
                </span>
                <span className="muted" style={{ fontSize: 15, fontWeight: 600, paddingBottom: 6 }}>
                  tokens left{purchasedMin > 0 ? ` of ${(purchasedMin * 10).toLocaleString()}` : ""}
                </span>
              </div>
              <div style={{ height: 9, borderRadius: 99, background: "#181828", overflow: "hidden", margin: "8px 0 14px" }}>
                <div style={{ height: "100%", width: poolPct + "%", background: low ? "linear-gradient(90deg,#f59e0b,#ef4444)" : "var(--grad-mint)", borderRadius: 99 }} />
              </div>
              <Link className="btn btn-primary" href="/office/billing" style={{ width: "100%", justifyContent: "center" }}><Icon name="card" size={16} /> Buy tokens</Link>
            </div>

            <div className="card card-pad rise" style={{ animationDelay: ".15s" }}>
              <h3 style={{ fontSize: 17, marginBottom: 14 }}>Needs a nudge</h3>
              {o.attention.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>Everyone&apos;s on track. 🎉</p>}
              {o.attention.map((t, i) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: i < o.attention.length - 1 ? 12 : 0 }}>
                  <div className="lb-av" style={{ width: 34, height: 34, fontSize: 12, background: t.status === "new" ? "linear-gradient(135deg,#a78bfa,#7c3aed)" : "linear-gradient(135deg,#fbbf24,#f59e0b)" }}>
                    {t.initials}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t.status === "new" ? `New — only ${t.usageHours.toFixed(1)}h practiced` : t.rec ?? "Needs attention"}
                    </div>
                  </div>
                  <span className="chip" style={{ padding: "3px 9px", fontSize: 11 }}>{t.status === "new" ? "New" : "Watch"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <OutcomesInsight funnel={funnel} periodName={period.name} />

        <OutcomesCard
          periodLabel={period.label}
          periodName={period.name}
          initial={
            outcome
              ? { monthlyLeads: outcome.monthlyLeads, consultsBooked: outcome.consultsBooked, casesStarted: outcome.casesStarted, production: outcome.production, note: outcome.note }
              : null
          }
        />
      </div>
    </>
  );
}
