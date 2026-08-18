import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole, isManagerRole, isCallCenterRole } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { getOfficeCoachContext } from "@/lib/office";
import { getGroupCoachContext } from "@/lib/group";
import { getCallCenterOverview, getPodOverview } from "@/lib/callcenter";
import { canStartSession, canStartGroupCoach, canStartCallCenter, callCenterOrgForAgent } from "@/lib/usage";
import { coachAgentId, managerCoachAgentId, groupCoachAgentId, getSignedUrl, isElevenLabsConfigured } from "@/lib/elevenlabs";
import {
  voiceCoachSystem,
  voiceCoachFirstMessage,
  voiceCoachFromCallSystem,
  voiceCoachFromCallFirstMessage,
  managerVoiceSystem,
  managerVoiceFirstMessage,
  groupVoiceSystem,
  groupVoiceFirstMessage,
  callCenterVoiceSystem,
  callCenterVoiceFirstMessage,
} from "@/lib/coach-prompts";
import { error, json } from "@/lib/api";

// POST /api/coach/voice/connect — bootstrap a voice coaching role-play.
// Builds a system-prompt + first-message override from the call context + the
// thing to practice, then mints a signed URL for the coach agent. Coaching time
// IS metered against the office pool (a COACH session is created and the
// authoritative duration is drawn down by the post-call webhook).
const Body = z.object({
  sessionId: z.string().optional(), // the practice call being coached (for context)
  focus: z.string().max(1200).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const first = user.firstName ?? "there";
  const activeRole = getActiveRole(user);

  // Call-center manager (senior or floor) → agent-development voice assistant,
  // grounded in the pod (floor) or whole center (senior), metered on the pool.
  // Checked before the office guard because a senior manager has no officeId.
  if (isCallCenterRole(activeRole) && user.organizationId) {
    return callCenterVoiceConnect(user.id, user.organizationId, user.callCenterPodId ?? null, activeRole, first);
  }

  // Agents (call-center phone agents) have no home office; they're handled in the
  // setter path below, metered against the call-center pool.
  if (!user.officeId && !user.callCenterPodId) return error("No office assigned", 400);

  // Group/DSO acting role → the portfolio strategist (multi-office grounded).
  // Checked before the generic manager branch since GROUP_ADMIN is a manager role.
  if (activeRole === "GROUP_ADMIN" && user.organizationId) {
    return groupVoiceConnect(user.id, user.organizationId, user.officeId!, first);
  }

  // Manager acting role → the management & training assistant (team-grounded),
  // not the setter call role-play. (Managers always have an office.)
  if (isManagerRole(activeRole)) {
    return managerVoiceConnect(user.id, user.officeId!, first);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const callSessionId = parsed.success ? parsed.data.sessionId : undefined;
  const rawFocus = parsed.success ? parsed.data.focus : undefined;

  // "Coach me from this call" → load the call so voice Setty can discuss it.
  const call = callSessionId ? await getSessionResult(callSessionId, user) : null;

  // Resolve office context + metering. A normal setter uses their own office and
  // the office pool. A call-center AGENT (no home office) coaches with the office
  // they practiced for (the coached call's office, else their first assigned
  // office) and meters the pooled CALL-CENTER balance.
  const isAgent = Boolean(user.callCenterPodId);
  let officeId: string | null = user.officeId;
  let callCenterOrgId: string | null = null;
  let office: { name: string | null; city: string | null; offerFraming: string | null } | null =
    user.office ? { name: user.office.name, city: user.office.city, offerFraming: user.office.offerFraming } : null;

  if (isAgent) {
    callCenterOrgId = await callCenterOrgForAgent(user.id);
    const callOfficeId = callSessionId ? (await prisma.session.findUnique({ where: { id: callSessionId }, select: { officeId: true } }))?.officeId ?? null : null;
    officeId = callOfficeId ?? (await prisma.agentOffice.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { officeId: true } }))?.officeId ?? null;
    if (!callCenterOrgId || !officeId) return error("You're not set up for coaching yet — ask your manager.", 400);
    office = await prisma.office.findUnique({ where: { id: officeId }, select: { name: true, city: true, offerFraming: true } });
  }

  let persona: string | null = null;
  let focus = (rawFocus && rawFocus.trim()) || "";
  if (call) {
    persona = call.persona;
    if (!focus) {
      const weakest = [...call.skills].sort((a, b) => a.score - b.score)[0];
      if (weakest) focus = `getting more comfortable with ${weakest.name.toLowerCase()}`;
    }
  }
  if (!focus) focus = "high-ticket appointment-setting fundamentals";

  // Coaching draws from a pool — block when it's empty (no free overage).
  const allowance = isAgent ? await canStartCallCenter(callCenterOrgId!) : await canStartSession(user.officeId!);
  if (!allowance.ok) {
    return error(isAgent ? "Your call center's practice balance is used up." : "Your practice pool is used up. Buy a bundle or wait for the reset.", 402);
  }

  // Call-grounded coaching when launched from a specific call; otherwise a fresh rep.
  const systemPrompt = call
    ? voiceCoachFromCallSystem({ first, officeName: office?.name, officeCity: office?.city, r: call })
    : voiceCoachSystem({
        first,
        officeName: office?.name,
        officeCity: office?.city,
        offerFraming: office?.offerFraming,
        persona,
        focus,
      });
  const firstMessage = call ? voiceCoachFromCallFirstMessage(first, call) : voiceCoachFirstMessage(first);

  if (!isElevenLabsConfigured() || !coachAgentId()) {
    return json({ configured: false, systemPrompt, firstMessage, focus });
  }

  // Create the metered coach session; its id rides as a dynamic variable so the
  // post-call webhook can match it and draw the duration down from the pool. For
  // an agent, callCenterOrgId meters the pool (and keeps it out of the office pool).
  const coachSession = await prisma.session.create({
    data: {
      setterId: user.id,
      officeId: officeId!,
      callCenterOrgId,
      serviceType: "IMPLANT",
      kind: "COACH",
      status: "IN_PROGRESS",
      personaSeed: { coaching: true, focus },
    },
  });

  const dynamicVariables: Record<string, string> = {
    setter_first_name: first,
    office_name: office?.name ?? "",
    focus,
    session_id: coachSession.id,
  };

  try {
    const signedUrl = await getSignedUrl(coachAgentId()!);
    return json({
      configured: true,
      signedUrl,
      systemPrompt,
      firstMessage,
      dynamicVariables,
      setterId: user.id,
      focus,
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't start the voice coach", 502);
  }
}

// The group/DSO leader's portfolio strategist — grounded across every office.
// Metered against the leader's own office pool (same pool model as the manager
// assistant), so a COACH session is created and the post-call webhook draws the
// duration down from that pool.
async function groupVoiceConnect(userId: string, orgId: string, officeId: string, first: string) {
  // Metered against the per-organization coach wallet (free monthly allowance +
  // purchased tokens), NOT the office pool.
  const allowance = await canStartGroupCoach(orgId);
  if (!allowance.ok) {
    return error("Your group Setty Advisor tokens are used up. Add a card and top up (50% off) to keep going, or wait for next month's free allowance.", 402);
  }

  const g = await getGroupCoachContext(orgId);
  const officeLines = g.offices.map(
    (o) =>
      `${o.name}${o.city ? ` (${o.city})` : ""}: avg ${o.teamAvg ? o.teamAvg.toFixed(1) : "—"}/5, ${o.activeSetters} active setters, ${o.sessions} scored sessions, status ${o.status}`
  );
  const systemicGaps = g.heatmap.filter((h) => h.avg < 3.7).map((h) => h.name);
  const topPerformers = g.topPerformers.map((t) => `${t.name} (${t.office})`);
  const attention = g.attention.map((o) => o.name);

  const systemPrompt = groupVoiceSystem({
    first,
    orgName: g.orgName,
    officeCount: g.officeCount,
    orgAvg: g.orgAvg,
    totalActiveSetters: g.totalActiveSetters,
    officeLines,
    systemicGaps,
    topPerformers,
    attention,
  });
  const firstMessage = groupVoiceFirstMessage(first);
  const agentId = groupCoachAgentId();

  if (!isElevenLabsConfigured() || !agentId) {
    return json({ configured: false, systemPrompt, firstMessage, focus: "group portfolio strategy" });
  }

  const coachSession = await prisma.session.create({
    data: {
      setterId: userId,
      officeId,
      organizationId: orgId, // metered against the org wallet, not the office pool
      serviceType: "IMPLANT",
      kind: "COACH",
      status: "IN_PROGRESS",
      personaSeed: { coaching: true, group: true, focus: "group portfolio strategy" },
    },
  });

  const dynamicVariables: Record<string, string> = {
    setter_first_name: first,
    office_name: g.orgName,
    focus: "group portfolio strategy",
    session_id: coachSession.id,
  };

  try {
    const signedUrl = await getSignedUrl(agentId);
    return json({
      configured: true,
      signedUrl,
      systemPrompt,
      firstMessage,
      dynamicVariables,
      setterId: userId,
      focus: "group portfolio strategy",
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't start the assistant", 502);
  }
}

// The manager's management & training assistant — grounded in the whole team.
async function managerVoiceConnect(userId: string, officeId: string, first: string) {
  const allowance = await canStartSession(officeId);
  if (!allowance.ok) {
    return error("Your practice pool is used up. Buy a bundle or wait for the reset.", 402);
  }

  const ctx = await getOfficeCoachContext(officeId);
  const o = ctx.overview;
  const teamLines = o.team.map(
    (t) =>
      `${t.name}: avg ${t.avg ? t.avg.toFixed(1) : "—"}/5 (Δ ${t.delta >= 0 ? "+" : ""}${t.delta}), ${t.sessions} sessions, status ${t.status}${t.recSkill ? `, focus: ${t.recSkill}` : ""}`
  );
  const systemicGaps = ctx.heatmap.filter((h) => h.avg < 3.7).map((h) => h.name);
  const watch = o.attention.map((t) => t.name);

  const systemPrompt = managerVoiceSystem({
    first,
    practiceName: o.practiceName,
    teamAvg: o.teamAvg,
    activeSetters: o.activeSetters,
    teamLines,
    systemicGaps,
    watch,
  });
  const firstMessage = managerVoiceFirstMessage(first);
  const agentId = managerCoachAgentId();

  if (!isElevenLabsConfigured() || !agentId) {
    return json({ configured: false, systemPrompt, firstMessage, focus: "team management & coaching" });
  }

  // Metered like any voice session (a COACH session the webhook draws down).
  const coachSession = await prisma.session.create({
    data: {
      setterId: userId,
      officeId,
      serviceType: "IMPLANT",
      kind: "COACH",
      status: "IN_PROGRESS",
      personaSeed: { coaching: true, manager: true, focus: "team management & coaching" },
    },
  });

  const dynamicVariables: Record<string, string> = {
    setter_first_name: first,
    office_name: o.practiceName,
    focus: "team management & coaching",
    session_id: coachSession.id,
  };

  try {
    const signedUrl = await getSignedUrl(agentId);
    return json({
      configured: true,
      signedUrl,
      systemPrompt,
      firstMessage,
      dynamicVariables,
      setterId: userId,
      focus: "team management & coaching",
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't start the assistant", 502);
  }
}

// The call-center manager's agent-development assistant — grounded in the pod
// (floor) or the whole center (senior). Metered against the call-center POOL: a
// COACH session carries callCenterOrgId (drawn down by the post-call webhook).
// Session.officeId is required, so we borrow one of the served offices as the FK
// (metering rides on callCenterOrgId, not this office). Reuses the manager agent.
async function callCenterVoiceConnect(userId: string, orgId: string, podId: string | null, activeRole: string, first: string) {
  const senior = activeRole === "CALL_CENTER_ADMIN";

  const allowance = await canStartCallCenter(orgId);
  if (!allowance.ok) {
    return error("Your call center's practice balance is used up. Add a card and top up to keep coaching.", 402);
  }

  const data = senior ? await getCallCenterOverview(orgId) : podId ? await getPodOverview(podId) : null;
  if (!data) return error("Your call-center account isn't set up yet — ask your senior manager.", 400);

  const officeId = data.offices[0]?.id ?? null;
  if (!officeId) return error("Add a served practice before coaching by voice.", 400);

  const agentLines = data.agents.map(
    (a) =>
      `${a.name}${senior && a.podName ? ` [${a.podName}]` : ""}: avg ${a.overall ? a.overall.toFixed(1) : "—"}/5, ${a.sessions} reps across ${a.officeCount} office${a.officeCount === 1 ? "" : "s"}, status ${a.status}${a.weakSkill ? `, focus: ${a.weakSkill}` : ""}`
  );
  const officeLines = data.offices.map((o) => `${o.name}: ${o.avg ? o.avg.toFixed(1) : "—"}/5 across ${o.agents} agent${o.agents === 1 ? "" : "s"}`);
  const systemicGaps = data.heatmap.filter((h) => h.avg < 3.7).map((h) => h.name);

  const systemPrompt = callCenterVoiceSystem({
    first,
    senior,
    scopeName: data.name,
    ccAvg: data.ccAvg,
    activeAgents: data.activeAgents,
    totalAgents: data.totalAgents,
    agentLines,
    officeLines,
    systemicGaps,
    watch: data.attention,
  });
  const firstMessage = callCenterVoiceFirstMessage(first);
  const agentId = managerCoachAgentId();

  if (!isElevenLabsConfigured() || !agentId) {
    return json({ configured: false, systemPrompt, firstMessage, focus: "agent coaching" });
  }

  const coachSession = await prisma.session.create({
    data: {
      setterId: userId,
      officeId,
      callCenterOrgId: orgId, // metered on the pool, kept out of the office pool
      serviceType: "IMPLANT",
      kind: "COACH",
      status: "IN_PROGRESS",
      personaSeed: { coaching: true, callCenter: true, focus: "agent coaching" },
    },
  });

  const dynamicVariables: Record<string, string> = {
    setter_first_name: first,
    office_name: data.name,
    focus: "agent coaching",
    session_id: coachSession.id,
  };

  try {
    const signedUrl = await getSignedUrl(agentId);
    return json({ configured: true, signedUrl, systemPrompt, firstMessage, dynamicVariables, setterId: userId, focus: "agent coaching" });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't start the assistant", 502);
  }
}
