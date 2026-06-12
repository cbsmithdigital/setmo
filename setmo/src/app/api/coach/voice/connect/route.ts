import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { getOfficeCoachContext } from "@/lib/office";
import { canStartSession } from "@/lib/usage";
import { coachAgentId, managerCoachAgentId, getSignedUrl, isElevenLabsConfigured } from "@/lib/elevenlabs";
import {
  voiceCoachSystem,
  voiceCoachFirstMessage,
  managerVoiceSystem,
  managerVoiceFirstMessage,
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
  if (!user.officeId) return error("No office assigned", 400);

  const first = user.firstName ?? "there";

  // Manager acting role → the management & training assistant (team-grounded),
  // not the setter call role-play.
  if (isManagerRole(getActiveRole(user))) {
    return managerVoiceConnect(user.id, user.officeId, first);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const callSessionId = parsed.success ? parsed.data.sessionId : undefined;
  const rawFocus = parsed.success ? parsed.data.focus : undefined;

  // Resolve focus + persona from the call being coached (if any).
  const office = user.office;
  let persona: string | null = null;
  let focus = (rawFocus && rawFocus.trim()) || "";

  if (callSessionId) {
    const r = await getSessionResult(callSessionId, user);
    if (r) {
      persona = r.persona;
      if (!focus) {
        const weakest = [...r.skills].sort((a, b) => a.score - b.score)[0];
        if (weakest) focus = `getting more comfortable with ${weakest.name.toLowerCase()}`;
      }
    }
  }
  if (!focus) focus = "high-ticket appointment-setting fundamentals";

  // Coaching draws from the pool — block when it's empty (no free overage).
  const allowance = await canStartSession(user.officeId);
  if (!allowance.ok) {
    return error("Your practice pool is used up. Buy a bundle or wait for the reset.", 402);
  }

  const systemPrompt = voiceCoachSystem({
    first,
    officeName: office?.name,
    officeCity: office?.city,
    offerFraming: office?.offerFraming,
    persona,
    focus,
  });
  const firstMessage = voiceCoachFirstMessage(first);

  if (!isElevenLabsConfigured() || !coachAgentId()) {
    return json({ configured: false, systemPrompt, firstMessage, focus });
  }

  // Create the metered coach session; its id rides as a dynamic variable so the
  // post-call webhook can match it and draw the duration down from the pool.
  const coachSession = await prisma.session.create({
    data: {
      setterId: user.id,
      officeId: user.officeId,
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
