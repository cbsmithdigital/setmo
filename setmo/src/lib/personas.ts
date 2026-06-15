import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { pickVoice, type Voice } from "@/lib/voices";

// ============================================================================
// AI LEAD persona generation. Just before a call connects we compose a fresh,
// coherent lead from curated ingredients (so reps never feel same-y), match it
// to a gender-appropriate voice, and load both into the ElevenLabs overrides.
// EDIT the pools + the lead prompt here to tune how leads behave.
// ============================================================================

const MODEL = process.env.SETMO_PERSONA_MODEL || "claude-haiku-4-5";

// Ingredient pools — a few are sampled each time to seed variety.
const SITUATIONS = [
  "missing several back teeth, struggling to chew",
  "failing bridge that needs replacing",
  "loose lower denture they hate",
  "one front tooth lost in an accident, very self-conscious",
  "years of avoided dental work, teeth finally failing",
  "dentist recommended full-arch but they're overwhelmed",
  "gum disease has loosened multiple teeth",
  "wants implants before a big life event (wedding, reunion)",
  "long-time denture wearer exploring implant-supported options",
  "researching All-on-4 after a friend got it",
];
const WHY_DRIVERS = [
  "embarrassed to smile in photos",
  "can't eat the foods they love",
  "afraid of looking old before their time",
  "tired of denture adhesive and slipping",
  "a recent comment from someone stung",
  "wants to feel confident at work again",
  "scared it's affecting their health",
  "putting it off for years and finally fed up",
];
const PAIN = ["mild", "moderate", "severe"] as const;
const OBJECTIONS = [
  "price — it sounds way too expensive",
  "fear of the surgery / pain",
  "needs to talk to their spouse first",
  "timing — too busy right now",
  "got a cheaper quote elsewhere",
  "skeptical it'll actually work for them",
  "worried about being pressured / upsold",
  "not sure it's worth it at their age",
];
const TONES = ["guarded", "anxious", "hopeful but cautious", "frustrated", "matter-of-fact", "chatty but non-committal", "skeptical"];
const AGES = ["late 40s", "50s", "early 60s", "mid 60s", "70s"];

const sample = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const PersonaZ = z.object({
  name: z.string(),
  gender: z.enum(["male", "female"]),
  age: z.string(),
  background: z.string(), // their dental situation + a bit of life context
  hiddenWhy: z.string(), // the real emotional driver — NOT volunteered
  painLevel: z.enum(["mild", "moderate", "severe"]),
  primaryObjection: z.string(),
  emotionalTone: z.string(),
  openingLine: z.string(), // how they answer when the setter calls
});
export type Persona = z.infer<typeof PersonaZ> & { voice: Voice };

export function isPersonaConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Compose a fresh lead persona (LLM from sampled ingredients) + match a voice. */
export async function generatePersona(): Promise<Persona> {
  const gender: "male" | "female" = Math.random() < 0.5 ? "male" : "female";
  const seed = {
    situation: sample(SITUATIONS),
    why: sample(WHY_DRIVERS),
    pain: sample(PAIN),
    objection: sample(OBJECTIONS),
    tone: sample(TONES),
    age: sample(AGES),
  };

  const fallback: z.infer<typeof PersonaZ> = {
    name: gender === "male" ? "Robert" : "Susan",
    gender,
    age: seed.age,
    background: `Considering dental implants — ${seed.situation}.`,
    hiddenWhy: seed.why,
    painLevel: seed.pain,
    primaryObjection: seed.objection,
    emotionalTone: seed.tone,
    openingLine: "Hello?",
  };

  if (!isPersonaConfigured()) return { ...fallback, voice: pickVoice(gender) };

  try {
    const client = new Anthropic();
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 700,
      // NB: Haiku 4.5 doesn't support the `effort` param — omit it here.
      output_config: { format: zodOutputFormat(PersonaZ) },
      system:
        "You compose realistic, varied personas for a dental implant/full-arch LEAD that a trainee appointment setter will call for practice. Make a believable, specific person — not a caricature. The hiddenWhy is the real emotional driver they would NOT volunteer unless the setter does good discovery. The openingLine is how they answer the phone (short, in-character, slightly guarded — they didn't expect the call). Vary names, ages, and details widely.",
      messages: [
        {
          role: "user",
          content: `Compose a ${gender} lead, roughly ${seed.age}. Weave in (don't copy verbatim): situation="${seed.situation}", underlying why="${seed.why}", pain level=${seed.pain}, main objection they'll raise="${seed.objection}", tone="${seed.tone}". Return the persona.`,
        },
      ],
    });
    const o = res.parsed_output;
    if (!o) return { ...fallback, voice: pickVoice(gender) };
    // keep the LLM's chosen gender consistent with the voice
    return { ...o, gender, voice: pickVoice(gender) };
  } catch {
    return { ...fallback, voice: pickVoice(gender) };
  }
}

// A short label stored on the session (shown in the report/coach).
export function personaLabel(p: Persona): string {
  return `${p.name} · ${p.painLevel} pain`;
}

/** The lead role-play system prompt sent as an ElevenLabs override. This REPLACES
 * the agent's base prompt, so it fully defines the lead's behavior for the call. */
export function buildLeadPrompt(
  p: Persona,
  office: { name?: string | null; city?: string | null; offerFraming?: string | null; appointmentFraming?: string | null },
  setterFirstName?: string | null
): string {
  return `You are role-playing a DENTAL LEAD on a phone call. A dental appointment setter${
    setterFirstName ? ` (${setterFirstName})` : ""
  } from ${office?.name ?? "a dental practice"}${office?.city ? ` in ${office.city}` : ""} is calling you. Stay FULLY in character as this one person for the entire call. You are NOT an assistant and never break character or mention being an AI.

WHO YOU ARE
- Name: ${p.name}, ${p.age}, ${p.gender}.
- Situation: ${p.background}
- Pain level: ${p.painLevel}. Let this color how motivated and emotional you are (severe = more urgency under the surface; mild = more casual/skeptical).
- Emotional tone: ${p.emotionalTone}.
- The REAL reason you're interested (your hidden "why"): ${p.hiddenWhy}. Do NOT volunteer this. Only open up about it if the setter earns it with genuine curiosity and good discovery questions. If they never dig, keep it surface-level.
- Your main hesitation: ${p.primaryObjection}. Raise it naturally at some point; don't give in easily.

HOW TO BEHAVE
- Talk like a real person on the phone: short, natural, sometimes hesitant. One thought at a time.
- Don't be a pushover and don't be impossible. Respond to skill: if the setter builds rapport, listens, uncovers your why, builds real value (not just price), handles your objection well, and asks for a commitment — warm up and be willing to book. If they're pushy, robotic, or skip discovery, stay guarded or non-committal.
- Make them work for the appointment. Only agree to book a consultation if they've genuinely handled your hesitation and given you a reason that matters to YOU.
- The practice's offer: ${office?.offerFraming ?? "a free implant consultation"}. Appointment framing: ${office?.appointmentFraming ?? "a consultation visit"}.
- If you agree to book, confirm it clearly so it's unmistakable ("okay, yes, let's set that up"). If you're not convinced by the end, politely decline or stall.
- Keep the call realistic in length; don't rush to a yes or a no.`;
}
