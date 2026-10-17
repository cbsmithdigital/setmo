import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole, isManagerRole, isCallCenterRole } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { getOfficeCoachContext } from "@/lib/office";
import { getGroupCoachContext, groupScope } from "@/lib/group";
import { getCallCenterOverview, getPodOverview } from "@/lib/callcenter";
import {
  coachChatSystem,
  coachGroundingFromCall,
  coachGeneralGrounding,
  adminCoachSystem,
  coachAdminGrounding,
  groupCoachSystem,
  coachGroupGrounding,
  callCenterCoachSystem,
  coachCallCenterGrounding,
} from "@/lib/coach-prompts";
import { error, json } from "@/lib/api";
import { withinLimits, tooMany, HOUR, DAY } from "@/lib/rate-limit";

export const maxDuration = 60;

const MODEL = process.env.SETMO_COACH_MODEL || "claude-sonnet-4-6";

// What one request may carry. The person's new message is capped; everything
// else (the coach's replies can run long) only counts toward the conversation
// total. The total is in UTF-8 bytes, not characters: Claude bills by tokens,
// and in other scripts a character can be several of them (English is the same
// either way). CoachChat sends just the latest turns that fit — keep its copy of
// these numbers in step.
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 30;
const MAX_HISTORY_BYTES = 30_000;

const Body = z.object({
  sessionId: z.string().optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1),
});

type Action = { type: string; summary: string };

// POST /api/coach/chat — routes by the user's ACTIVE role:
//  • Setter  → "Coach me from this call" / general skill coaching (grounded in their calls).
//  • Manager → Practice Performance Coach: diagnose the team, recommend, and
//    actually assign trainings via tool use. Prompts live in src/lib/coach-prompts.ts.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!process.env.ANTHROPIC_API_KEY) return error("Coach isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { sessionId, messages } = parsed.data;
  // Only the new message is held to its cap; earlier turns count toward the
  // total. Re-checking them would refuse every later message from a page that
  // kept a refused one in its thread, as the chat did before these caps.
  const latest = messages[messages.length - 1];
  if (latest.role === "user" && latest.content.length > MAX_MESSAGE_CHARS) {
    return error(`That message is too long for Setty — please keep it under ${MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters.`, 413);
  }
  if (messages.length > MAX_HISTORY_MESSAGES || messages.reduce((n, m) => n + utf8Bytes(m.content), 0) > MAX_HISTORY_BYTES) {
    return error("This chat has gotten too long for Setty to follow. Refresh the page to start a fresh one.", 413);
  }

  // Chat is free for everyone, demo practices included, so these limits are what
  // bound the Claude spend (call scoring uses the same key and model). Each one
  // counts a message only once the one before it lets it through, so pressing
  // send while held back doesn't use up the rest of the day, or a teammate's share.
  let limit = await withinLimits([{ key: `coach-chat:${user.id}`, limit: 30, windowSeconds: HOUR }]);
  if (limit.ok) limit = await withinLimits([{ key: `coach-chat-day:${user.id}`, limit: 200, windowSeconds: DAY }]);
  if (!limit.ok) {
    // Only the daily window can be more than an hour from resetting.
    const wait = waitText(limit.retryAfter);
    return tooMany(
      limit.retryAfter,
      limit.retryAfter > HOUR
        ? `You've reached today's chat limit with Setty — it resets in about ${wait}.`
        : `You've reached Setty's chat limit for now — you can pick this back up in about ${wait}.`
    );
  }
  // Invites make new logins cheaply, so the whole practice (or group, or call
  // center) also shares a daily ceiling, far above what a real team uses.
  const team = user.organizationId ?? user.officeId ?? user.id;
  const teamLimit = await withinLimits([{ key: `coach-chat-team-day:${team}`, limit: 1000, windowSeconds: DAY }]);
  if (!teamLimit.ok) {
    console.warn("[setmo:coach] a team reached its daily chat ceiling", { team });
    return tooMany(teamLimit.retryAfter, `Your team has reached today's chat limit with Setty — it resets in about ${waitText(teamLimit.retryAfter)}.`);
  }

  const first = user.firstName ?? "there";
  const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));

  const activeRole = getActiveRole(user);
  try {
    // "Coach me from this call" — ground in the specific call for whoever can
    // view it, regardless of active role (this is call coaching, not team/group).
    if (sessionId) {
      const r = await getSessionResult(sessionId, user);
      if (r) {
        const client = new Anthropic();
        const res = await client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: coachChatSystem(coachGroundingFromCall(first, r)),
          messages: apiMessages,
        });
        return json({ reply: textOf(res), actions: [] });
      }
    }
    if (isCallCenterRole(activeRole) && user.organizationId) {
      return await callCenterChat(first, activeRole, user.organizationId, user.callCenterPodId ?? null, apiMessages);
    }
    if ((activeRole === "GROUP_ADMIN" || activeRole === "MULTI_PRACTICE_ADMIN") && user.organizationId) {
      const { officeIds } = await groupScope(user);
      return await groupChat(first, user.organizationId, apiMessages, officeIds);
    }
    if (isManagerRole(activeRole) && user.officeId) {
      return await managerChat(first, user.officeId, apiMessages);
    }
    return await setterChat(first, user.id, undefined, apiMessages);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Coach failed", 502);
  }
}

// ---- Setter coach (unchanged behavior) ----
async function setterChat(
  first: string,
  userId: string,
  sessionId: string | undefined,
  apiMessages: { role: "user" | "assistant"; content: string }[]
) {
  let grounding: string | null = null;
  if (sessionId) {
    const r = await getSessionResult(sessionId, { id: userId, role: "SETTER", officeId: null });
    if (r) grounding = coachGroundingFromCall(first, r);
  }
  if (!grounding) {
    const memory = await prisma.setterMemory.findUnique({ where: { setterId: userId } });
    grounding = coachGeneralGrounding(first, memory?.summary);
  }

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: coachChatSystem(grounding),
    messages: apiMessages,
  });
  return json({ reply: textOf(res), actions: [] });
}

// ---- Group/DSO coach (portfolio strategist, analytical) ----
async function groupChat(
  first: string,
  orgId: string,
  apiMessages: { role: "user" | "assistant"; content: string }[],
  officeIds?: string[]
) {
  const g = await getGroupCoachContext(orgId, officeIds);
  const system = groupCoachSystem(
    coachGroupGrounding(first, {
      orgName: g.orgName,
      officeCount: g.officeCount,
      orgAvg: g.orgAvg,
      totalActiveSetters: g.totalActiveSetters,
      sessionsThisWeek: g.sessionsThisWeek,
      offices: g.offices.map((o) => ({ name: o.name, city: o.city, teamAvg: o.teamAvg, activeSetters: o.activeSetters, sessions: o.sessions, status: o.status })),
      heatmap: g.heatmap.map((h) => ({ name: h.name, avg: h.avg })),
      topPerformers: g.topPerformers,
      attention: g.attention.map((o) => ({ name: o.name, status: o.status })),
    })
  );

  const client = new Anthropic();
  const res = await client.messages.create({ model: MODEL, max_tokens: 1500, system, messages: apiMessages });
  return json({ reply: textOf(res), actions: [] });
}

// ---- Call-center coach (agent development; senior = center, floor = pod) ----
async function callCenterChat(
  first: string,
  activeRole: string,
  orgId: string,
  podId: string | null,
  apiMessages: { role: "user" | "assistant"; content: string }[]
) {
  const senior = activeRole === "CALL_CENTER_ADMIN";
  const data = senior ? await getCallCenterOverview(orgId) : podId ? await getPodOverview(podId) : null;
  if (!data) return json({ reply: "Your call-center account isn't set up yet.", actions: [] });

  const system = callCenterCoachSystem(
    coachCallCenterGrounding(first, {
      scopeName: data.name,
      senior,
      ccAvg: data.ccAvg,
      activeAgents: data.activeAgents,
      totalAgents: data.totalAgents,
      agents: data.agents.map((a) => ({ name: a.name, podName: a.podName, overall: a.overall, sessions: a.sessions, officeCount: a.officeCount, weakSkill: a.weakSkill, status: a.status })),
      offices: data.offices.map((o) => ({ name: o.name, avg: o.avg, agents: o.agents })),
      heatmap: data.heatmap.map((h) => ({ name: h.name, avg: h.avg })),
      attention: data.attention,
    })
  );

  const client = new Anthropic();
  const res = await client.messages.create({ model: MODEL, max_tokens: 1500, system, messages: apiMessages });
  return json({ reply: textOf(res), actions: [] });
}

// ---- Manager coach (Practice Performance Coach, with actions) ----
async function managerChat(
  first: string,
  officeId: string,
  apiMessages: { role: "user" | "assistant"; content: string }[]
) {
  const ctx = await getOfficeCoachContext(officeId);
  const o = ctx.overview;

  const system = adminCoachSystem(
    coachAdminGrounding(first, {
      practiceName: o.practiceName,
      teamAvg: o.teamAvg,
      activeSetters: o.activeSetters,
      sessionsThisWeek: o.sessionsThisWeek,
      team: o.team.map((t) => ({
        name: t.name,
        avg: t.avg,
        delta: t.delta,
        sessions: t.sessions,
        usageHours: t.usageHours,
        status: t.status,
        recSkill: t.recSkill,
      })),
      heatmap: ctx.heatmap.map((h) => ({ name: h.name, avg: h.avg })),
      outcomes: ctx.outcomes.map((x) => ({ periodLabel: x.periodLabel, consultsBooked: x.consultsBooked, note: x.note })),
      trainings: ctx.trainings.map((t) => ({ title: t.title, skillKey: t.skillKey })),
      trainingImpact: { avgDelta: ctx.trainingImpact.avgDelta, measured: ctx.trainingImpact.measured, rows: ctx.trainingImpact.rows.slice(0, 5).map((r) => ({ setterName: r.setterName, skillName: r.skillName, delta: r.delta })) },
    })
  );

  const tools: Anthropic.Tool[] = [
    {
      name: "assign_training",
      description:
        "Assign a published training to a specific setter on this team to address a skill gap. Only use setter names and skills that appear in the provided team data. The setter sees it as a recommendation.",
      input_schema: {
        type: "object",
        properties: {
          setter_name: { type: "string", description: "The setter's name, exactly as shown in TEAM DATA." },
          skill_key: {
            type: "string",
            description: "The skill to target — one of: rapport, listening, discovery, painpoint, objection, confidence, value, closing.",
          },
          reason: { type: "string", description: "Short reason the setter will see, e.g. 'objection handling dipped on your last two calls'." },
        },
        required: ["setter_name", "skill_key", "reason"],
      },
    },
  ];

  const client = new Anthropic();
  const convo: Anthropic.MessageParam[] = [...apiMessages];
  const actions: Action[] = [];
  let reply = "";

  for (let i = 0; i < 4; i++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 1500, system, tools, messages: convo });
    convo.push({ role: "assistant", content: res.content });

    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      reply = textOf(res);
      break;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const out = await assignTraining(officeId, ctx, tu.input as Record<string, unknown>);
      if (out.ok) actions.push({ type: "assign_training", summary: out.summary });
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out.summary, is_error: !out.ok });
    }
    convo.push({ role: "user", content: results });
  }

  if (!reply) reply = actions.length ? `Done — ${actions.map((a) => a.summary).join(" ")}` : "…";
  return json({ reply, actions });
}

async function assignTraining(
  officeId: string,
  ctx: Awaited<ReturnType<typeof getOfficeCoachContext>>,
  input: Record<string, unknown>
): Promise<{ ok: boolean; summary: string }> {
  const setterName = String(input.setter_name ?? "").trim();
  const skillKey = String(input.skill_key ?? "").trim().toLowerCase();
  const reason = String(input.reason ?? "").trim() || "Recommended by your coach";

  const needle = setterName.toLowerCase();
  const setter =
    ctx.setters.find((s) => s.name.toLowerCase() === needle) ??
    ctx.setters.find((s) => s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase().split(" ")[0]));
  if (!setter) return { ok: false, summary: `No setter named "${setterName}" on this team. Available: ${ctx.setters.map((s) => s.name).join(", ")}.` };

  const training = ctx.trainings.find((t) => t.skillKey === skillKey) ?? ctx.trainings.find((t) => t.skillKey);
  if (!training) return { ok: false, summary: "No published training is available to assign yet." };

  // One active recommendation per setter+skill — update if it already exists.
  const existing = await prisma.recommendation.findFirst({ where: { setterId: setter.id, skillKey: training.skillKey ?? skillKey, status: "ACTIVE" } });
  if (existing) {
    await prisma.recommendation.update({ where: { id: existing.id }, data: { trainingId: training.id, reason } });
  } else {
    const { createRecommendation } = await import("@/lib/coaching");
    await createRecommendation({ setterId: setter.id, trainingId: training.id, skillKey: training.skillKey ?? skillKey, reason });
  }
  // Keep ctx in sync so the model doesn't double-assign within one turn.
  void officeId;
  return { ok: true, summary: `Assigned "${training.title}" to ${setter.name} (${training.skillKey ?? skillKey}).` };
}

/** Size in UTF-8 bytes, the measure for the conversation total (see the caps above). */
function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** "20 minutes" / "5 hours" — how long until a limit lets the next message through. */
function waitText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function textOf(res: Anthropic.Message): string {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
