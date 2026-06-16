import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOfficeCoachContext, currentPeriod } from "@/lib/office";
import { getGroupOverview } from "@/lib/group";
import { getGroupOutcomes, getOfficeOutcomeFunnel } from "@/lib/outcomes";
import { getSetterHome } from "@/lib/queries";

// Setty's cached "next move" — one decisive, grounded recommendation per subject.
// Generated on demand, cached for a week, reused in the weekly digests.

export type InsightScope = "SETTER" | "OFFICE" | "GROUP";
const MODEL = process.env.SETMO_COACH_MODEL || "claude-sonnet-4-6";
const MAX_AGE_MS = 7 * 24 * 3600_000;

const InsightZ = z.object({
  headline: z.string().describe("A punchy ≤60-char title for the single most important move right now."),
  body: z.string().describe("2–4 sentences, OR up to 3 short lines each starting with '- '. Specific, decisive, uses the real names/numbers. No markdown headers, no fabricated revenue."),
});
export type GeneratedInsight = z.infer<typeof InsightZ>;

const SYSTEM = `You are Setty, a sharp, practical sales-leadership coach inside SetMo (dental appointment setters booking high-ticket implant/full-arch consults). Given a data snapshot, return the SINGLE highest-leverage next move — what this person should do this week. Be concrete and decisive: name the specific person/location/skill and the action. Use only the names and numbers in the snapshot. Never invent booking or revenue outcomes. Keep it short.`;

// ---- context builders: compact snapshot + a deterministic fallback ----

async function officeContext(officeId: string): Promise<{ text: string; fallback: GeneratedInsight } | null> {
  const ctx = await getOfficeCoachContext(officeId);
  const o = ctx.overview;
  if (o.team.length === 0) return null;
  const funnel = await getOfficeOutcomeFunnel(officeId, currentPeriod().label);
  const team = o.team
    .map((t) => `- ${t.name}: ${t.avg ? t.avg.toFixed(1) : "—"}/5 (Δ${t.delta >= 0 ? "+" : ""}${t.delta}), ${t.sessions} sessions, ${t.status}${t.recSkill ? `, focus ${t.recSkill}` : ""}`)
    .join("\n");
  const gap = o.gapSkills[0];
  const watch = o.attention[0];
  const text = `PRACTICE: ${o.practiceName}
Team avg ${o.teamAvg.toFixed(1)}/5 · ${o.activeSetters} active setters · ${o.sessionsThisWeek} sessions this week.
Set rate ${funnel.setRatePct}% · show rate ${funnel.showRatePct}% (from practice calls).
Strengths: ${o.topSkills.map((s) => `${s.name} ${s.avg.toFixed(1)}`).join(", ")}.
Gaps: ${o.gapSkills.map((s) => `${s.name} ${s.avg.toFixed(1)}`).join(", ")}.
SETTERS:
${team}
NEEDS ATTENTION: ${o.attention.length ? o.attention.map((t) => t.name).join(", ") : "none"}.`;
  const fallback: GeneratedInsight = {
    headline: gap ? `Tighten ${gap.name.toLowerCase()} as a team` : "Keep the momentum going",
    body: `${gap ? `${gap.name} is the team's lowest skill at ${gap.avg.toFixed(1)}/5 — run a focused drill in this week's huddle.` : "The team is steady across the board."}${watch ? ` ${watch.name} needs a 1:1 — ${watch.rec ?? "they've gone quiet"}.` : ""}`,
  };
  return { text, fallback };
}

async function groupContext(orgId: string): Promise<{ text: string; fallback: GeneratedInsight } | null> {
  const g = await getGroupOverview(orgId);
  if (g.totalActiveSetters === 0) return null;
  const outcomes = await getGroupOutcomes(orgId, currentPeriod().label);
  const gap = [...g.heatmap].sort((a, b) => a.avg - b.avg)[0];
  const watch = g.attention[0];
  const top = g.topPerformers[0];
  const text = `GROUP: ${g.orgName} — ${g.officeCount} locations, ${g.totalActiveSetters} active setters.
Group avg ${g.orgAvg.toFixed(1)}/5. Set rate ${outcomes.setRatePct}% · show rate ${outcomes.showRatePct}% · ${outcomes.totalCases} treatment starts this month.
LOCATIONS (avg): ${g.offices.filter((o) => o.activeSetters > 0).map((o) => `${o.name} ${o.teamAvg.toFixed(1)} (${o.status})`).join(", ")}.
GROUP SKILL HEATMAP: ${g.heatmap.map((h) => `${h.name} ${h.avg.toFixed(1)}`).join(", ")}.
TOP PERFORMER: ${top ? `${top.name} (${top.office}) ${top.avg.toFixed(1)}` : "n/a"}.
NEEDS ATTENTION: ${g.attention.length ? g.attention.map((o) => o.name).join(", ") : "none"}.`;
  const fallback: GeneratedInsight = {
    headline: gap ? `${gap.name} is the portfolio gap` : "Portfolio is healthy",
    body: `${gap ? `${gap.name} averages ${gap.avg.toFixed(1)}/5 across locations — a central playbook opportunity.` : "Skills are strong group-wide."}${watch ? ` ${watch.name} is the location to support first.` : ""}${top ? ` Consider having ${top.name} share what's working.` : ""}`,
  };
  return { text, fallback };
}

async function setterContext(userId: string): Promise<{ text: string; fallback: GeneratedInsight } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, officeId: true, firstName: true } });
  if (!user?.officeId) return null;
  const h = await getSetterHome(user);
  if (!h.recent.length) return null;
  const text = `SETTER: ${h.firstName}
This month avg ${h.avg.toFixed(1)}/5 (Δ${h.avgDelta >= 0 ? "+" : ""}${h.avgDelta} vs last month) · ${h.sessionsThisWeek} sessions this week.
Best skill: ${h.best?.name ?? "—"}. Focus skill: ${h.focus?.name ?? "—"} (${h.focus ? h.focus.score.toFixed(1) : "—"}/5).
Recent scores: ${h.recent.slice(0, 5).map((r) => r.score.toFixed(1)).join(", ")}.${h.recommendation ? ` Assigned training: "${h.recommendation.training}".` : ""}`;
  const fallback: GeneratedInsight = {
    headline: h.focus ? `Sharpen ${h.focus.name.toLowerCase()}` : "Keep your streak going",
    body: `${h.focus ? `${h.focus.name} is your focus area at ${h.focus.score.toFixed(1)}/5.` : "You're scoring well across the board."} You're ${h.avgDelta >= 0 ? "trending up" : "a touch down"} this month — run 2 focused reps this week${h.recommendation ? ` and finish "${h.recommendation.training}"` : ""}.`,
  };
  return { text, fallback };
}

async function buildContext(scope: InsightScope, subjectId: string) {
  if (scope === "OFFICE") return officeContext(subjectId);
  if (scope === "GROUP") return groupContext(subjectId);
  return setterContext(subjectId);
}

async function generate(scope: InsightScope, subjectId: string): Promise<GeneratedInsight | null> {
  const ctx = await buildContext(scope, subjectId);
  if (!ctx) return null;
  if (!process.env.ANTHROPIC_API_KEY) return ctx.fallback;
  try {
    const client = new Anthropic();
    const msg = await client.messages.parse({
      model: MODEL,
      max_tokens: 600,
      output_config: { format: zodOutputFormat(InsightZ), effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: `Here is the latest snapshot. Give the single highest-leverage next move.\n\n${ctx.text}` }],
    });
    return msg.parsed_output ?? ctx.fallback;
  } catch {
    return ctx.fallback;
  }
}

/** Cached insight for a subject; regenerates if missing, stale, or forced. */
export async function getInsight(scope: InsightScope, subjectId: string, opts: { force?: boolean } = {}) {
  const existing = await prisma.coachInsight.findUnique({ where: { scope_subjectId: { scope, subjectId } } });
  const fresh = existing && Date.now() - existing.generatedAt.getTime() < MAX_AGE_MS;
  if (existing && fresh && !opts.force) return existing;

  const gen = await generate(scope, subjectId);
  if (!gen) return existing ?? null; // not enough data — keep any prior insight

  return prisma.coachInsight.upsert({
    where: { scope_subjectId: { scope, subjectId } },
    create: { scope, subjectId, headline: gen.headline, body: gen.body, model: MODEL },
    update: { headline: gen.headline, body: gen.body, model: MODEL, generatedAt: new Date() },
  });
}
