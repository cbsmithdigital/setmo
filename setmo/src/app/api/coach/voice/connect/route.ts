import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { canStartSession } from "@/lib/usage";
import { coachAgentId, getSignedUrl, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { voiceCoachSystem, voiceCoachFirstMessage } from "@/lib/coach-prompts";
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

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const callSessionId = parsed.success ? parsed.data.sessionId : undefined;
  const rawFocus = parsed.success ? parsed.data.focus : undefined;

  // Resolve focus + persona from the call being coached (if any).
  const first = user.firstName ?? "there";
  const office = user.office;
  let persona: string | null = null;
  let focus = (rawFocus && rawFocus.trim()) || "";

  if (callSessionId) {
    const r = await getSessionResult(callSessionId, user.id);
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
