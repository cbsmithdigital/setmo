import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { coachAgentId, getSignedUrl, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { error, json } from "@/lib/api";

// POST /api/coach/voice/connect — bootstrap a voice coaching role-play. Builds
// a system-prompt + first-message override from the call context and the thing
// the setter wants to practice, then mints a signed URL for the coach agent.
// Not scored, not metered like a practice session — it's rehearsal.
const Body = z.object({
  sessionId: z.string().optional(),
  focus: z.string().max(1200).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const sessionId = parsed.success ? parsed.data.sessionId : undefined;
  const rawFocus = parsed.success ? parsed.data.focus : undefined;

  const first = user.firstName ?? "there";
  const office = user.office;
  let persona: string | null = null;

  if (sessionId) {
    const r = await getSessionResult(sessionId, user.id);
    if (r) {
      persona = r.persona;
      if (!rawFocus) {
        const weakest = [...r.skills].sort((a, b) => a.score - b.score)[0];
        // no explicit focus given — default to the call's weakest skill
        if (weakest) return buildAndReturn({ user, first, office, persona, focus: `getting more comfortable with ${weakest.name.toLowerCase()}` });
      }
    }
  }

  const focus = (rawFocus && rawFocus.trim()) || "high-ticket appointment-setting fundamentals";
  return buildAndReturn({ user, first, office, persona, focus });
}

async function buildAndReturn(opts: {
  user: { id: string };
  first: string;
  office: { name?: string | null; city?: string | null; offerFraming?: string | null } | null | undefined;
  persona: string | null;
  focus: string;
}) {
  const { first, office, persona, focus } = opts;

  const systemPrompt = `You are SetMo's voice practice coach for ${first}, a dental appointment setter${
    office?.name ? ` at ${office.name}` : ""
  }${office?.city ? ` (${office.city})` : ""}. Run a focused, realistic role-play so they can rehearse this specific thing:

"${focus}"

Play a believable dental lead — push back naturally (price, fear of pain, "talk to my spouse," timing) the way a real caller would.${
    persona ? ` Base the lead on: ${persona}.` : ""
  }${office?.offerFraming ? ` The practice's offer: ${office.offerFraming}.` : ""}

Stay in character during each rep. When ${first} handles the moment well — or asks for help — briefly step out of character to give ONE specific, encouraging tip plus a stronger phrase they can use, then run the moment again so it locks in. Keep your turns short and conversational. This is low-stakes practice: be warm and build their confidence.`;

  const firstMessage = `Hey ${first}! Let's lock this in with a quick rep. I'll play the lead — go ahead and open the call whenever you're ready, and I'll respond just like a real one would.`;

  const dynamicVariables: Record<string, string> = {
    setter_first_name: first,
    office_name: office?.name ?? "",
    focus,
  };

  if (!isElevenLabsConfigured() || !coachAgentId()) {
    return json({ configured: false, systemPrompt, firstMessage, dynamicVariables });
  }

  try {
    const signedUrl = await getSignedUrl(coachAgentId()!);
    return json({
      configured: true,
      signedUrl,
      systemPrompt,
      firstMessage,
      dynamicVariables,
      setterId: opts.user.id,
      focus,
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't start the voice coach", 502);
  }
}
