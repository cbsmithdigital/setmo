import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Voice } from "@/lib/voices";
import { pickVoiceFor } from "@/lib/realism/voices";
import { rngFrom } from "@/lib/realism/rng";
import { pickName } from "@/lib/realism/names";
import { sampleCardFacts, onFileBlock, plainNote, LEAD_SOURCES } from "@/lib/realism/lead-card";
import { guardNote } from "@/lib/realism/note-guard";
import type { CardFacts, LeadChoice } from "@/lib/realism/types";

// ============================================================================
// AI LEAD persona generation. Just before a call connects we compose a fresh,
// coherent lead from curated ingredients (so reps never feel same-y), match it
// to a voice of their gender that suits their age, and load both into the
// ElevenLabs overrides.
// EDIT the pools + the lead prompt here to tune how leads behave.
// ============================================================================

const MODEL = process.env.SETMO_PERSONA_MODEL || "claude-haiku-4-5";

// Ingredient pools — a few are sampled each time to seed variety. Each situation
// carries what the lead card says they're interested in.
const SITUATIONS: { text: string; interest: string }[] = [
  { text: "missing several back teeth, struggling to chew", interest: "Replacing missing back teeth" },
  { text: "failing bridge that needs replacing", interest: "Replacing a failing bridge" },
  { text: "loose lower denture they hate", interest: "Something better than a loose denture" },
  { text: "one front tooth lost in an accident, very self-conscious", interest: "Replacing a front tooth" },
  { text: "years of avoided dental work, teeth finally failing", interest: "A full-mouth fix" },
  { text: "dentist recommended full-arch but they're overwhelmed", interest: "Full-arch implants" },
  { text: "gum disease has loosened multiple teeth", interest: "Loose teeth" },
  { text: "wants implants before a big life event (wedding, reunion)", interest: "Implants, with a date in mind" },
  { text: "long-time denture wearer exploring implant-supported options", interest: "Implant-supported dentures" },
  { text: "researching All-on-4 after a friend got it", interest: "All-on-4" },
];

// How implant leads reach a practice (keys into LEAD_SOURCES).
const IMPLANT_SOURCES = [
  { key: "fb_ad", weight: 30 },
  { key: "google_form", weight: 22 },
  { key: "website_quiz", weight: 14 },
  { key: "ig_ad", weight: 12 },
  { key: "voicemail", weight: 12 },
  { key: "referral", weight: 10 },
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

// "Pick your lead" for implant calls. A concern is one of the objections above —
// it chooses WHICH hesitation they bring; the challenge level still sets how
// firmly they hold it (the tone pool and the difficulty directive). An age range
// is a slice of AGES.
export const IMPLANT_CONCERNS: { key: string; label: string; objection: string }[] = [
  { key: "cost", label: "Cost", objection: OBJECTIONS[0] },
  { key: "fear", label: "Fear of surgery or pain", objection: OBJECTIONS[1] },
  { key: "spouse", label: "Spouse has to agree", objection: OBJECTIONS[2] },
  { key: "timing", label: "Bad timing", objection: OBJECTIONS[3] },
  { key: "shopping", label: "Got a cheaper quote", objection: OBJECTIONS[4] },
  { key: "doubt", label: "Doubts it'll work", objection: OBJECTIONS[5] },
  { key: "pressure", label: "Worried about a hard sell", objection: OBJECTIONS[6] },
  { key: "age", label: "Not sure it's worth it at their age", objection: OBJECTIONS[7] },
];
/** The actual ages behind each AGES phrase — a lead gets one exact age, drawn in
 *  code, so the card, the name and the person all agree on it. */
const AGE_RANGE: Record<string, [number, number]> = {
  "late 40s": [46, 49],
  "50s": [50, 59],
  "early 60s": [60, 63],
  "mid 60s": [64, 67],
  "70s": [70, 79],
};
/** `excludes`: concerns that don't make sense at that age ("not worth it at my
 *  age" from someone in their 40s). */
export const IMPLANT_AGES: { key: string; label: string; pool: string[]; excludes?: string[] }[] = [
  { key: "40s-50s", label: "40s–50s", pool: ["late 40s", "50s"], excludes: ["age"] },
  { key: "60s", label: "60s", pool: ["early 60s", "mid 60s"] },
  { key: "70s", label: "70s+", pool: ["70s"] },
];

// The three challenge levels the setter picks (ADAPTIVE escalates from the
// setter's memory floor). Difficulty biases BOTH the sampled ingredients (a
// tougher lead skews to harder objections + guarded tones) AND the behavior
// directive in the lead prompt (how hard they are to win over).
export type Difficulty = "ADAPTIVE" | "WARM" | "TOUGH";

const DIFFICULTY_TONES: Record<Difficulty, readonly string[]> = {
  WARM: ["hopeful but cautious", "chatty but non-committal", "matter-of-fact"],
  ADAPTIVE: TONES,
  TOUGH: ["guarded", "skeptical", "frustrated"],
};
const DIFFICULTY_OBJECTIONS: Record<Difficulty, readonly string[]> = {
  WARM: ["needs to talk to their spouse first", "timing — too busy right now", "not sure it's worth it at their age"],
  ADAPTIVE: OBJECTIONS,
  TOUGH: ["price — it sounds way too expensive", "got a cheaper quote elsewhere", "skeptical it'll actually work for them", "worried about being pressured / upsold"],
};
const DIFFICULTY_HINT: Record<Difficulty, string> = {
  WARM: " This lead is relatively RECEPTIVE and friendly — open to the call and warms up quickly to a decent setter.",
  ADAPTIVE: "",
  TOUGH: " This lead is GUARDED and skeptical — hard to win over, holds their objection firmly, and is slow to trust.",
};
const DIFFICULTY_DIRECTIVE: Record<Difficulty, string> = {
  WARM: `DIFFICULTY — WARM LEAD: You're a more receptive, friendly lead. You still want to be heard, but you warm up quickly when the setter is decent: share your "why" with only light prompting, hold your objection only briefly, and lean toward saying yes once they've handled your main concern reasonably.`,
  ADAPTIVE: `DIFFICULTY — BALANCED LEAD: Respond in proportion to the setter's skill — neither a pushover nor impossible. Warm up as they earn it.`,
  TOUGH: `DIFFICULTY — TOUGH LEAD: You're guarded and skeptical. Make the setter really earn it: keep your "why" hidden unless they do excellent discovery, hold your objection firmly and re-raise it if it's brushed off, and only agree to book if they've genuinely handled your concern AND given a compelling reason that matters to YOU. Default to stalling or a polite "let me think about it" unless they're truly good.`,
};

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
  formNote: z.string(), // what they typed when they reached out — on the setter's lead card
});
export type Persona = Omit<z.infer<typeof PersonaZ>, "formNote"> & {
  voice: Voice;
  /** Leads composed before the lead card existed have none of these. */
  formNote?: string;
  interest?: string;
  card?: CardFacts;
};

export function isPersonaConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Compose a fresh lead persona (LLM from sampled ingredients) + match a voice.
 *  `difficulty` skews the sampled tone/objection so a tougher pick genuinely
 *  produces a harder lead (see DIFFICULTY_* pools). `choice` is "pick your
 *  lead"; `card` adds what the practice has on file (the lead card). */
export async function generatePersona(
  difficulty: Difficulty = "ADAPTIVE",
  opts: { choice?: LeadChoice; card?: boolean } = {}
): Promise<Persona> {
  const choice = opts.choice ?? {};
  const rng = rngFrom(randomUUID());
  const gender: "male" | "female" = choice.gender ?? (rng.chance(0.5) ? "male" : "female");
  const ageBand = sample(IMPLANT_AGES.find((a) => a.key === choice.age)?.pool ?? AGES);
  // One exact age, drawn in code from the band, so the card, the name and the
  // person agree on it.
  const [lo, hi] = AGE_RANGE[ageBand] ?? [55, 65];
  const age = rng.int(lo, hi);
  // The name is picked in code too, to fit that age: left to the model it was
  // Patricia or Robert most of the time.
  const { firstName, lastName } = pickName(rng, gender, age);
  const name = `${firstName} ${lastName}`;
  // And the voice: their gender, suited to their age.
  const { id: voiceId, name: voiceName } = pickVoiceFor(rng, { gender, age });
  const voice: Voice = { name: voiceName, id: voiceId };
  const picked = IMPLANT_CONCERNS.find((c) => c.key === choice.concern);
  const situation = sample(SITUATIONS);
  const seed = {
    situation: situation.text,
    why: sample(WHY_DRIVERS),
    pain: sample(PAIN),
    // A picked concern chooses WHICH hesitation; the challenge level still sets
    // how firmly they hold it (tone + the difficulty directive).
    objection: picked?.objection ?? sample(DIFFICULTY_OBJECTIONS[difficulty]),
    tone: sample(DIFFICULTY_TONES[difficulty]),
  };
  const card = opts.card ? sampleCardFacts(rng, IMPLANT_SOURCES) : undefined;
  const source = card ? LEAD_SOURCES[card.source] ?? LEAD_SOURCES.google_form : null;
  const extras = card ? { interest: situation.interest, card } : {};
  const plain = source ? plainNote({ noteKind: source.noteKind }) : undefined;

  const fallback: Persona = {
    name,
    gender,
    age: String(age),
    background: `Considering dental implants — ${seed.situation}.`,
    hiddenWhy: seed.why,
    painLevel: seed.pain,
    primaryObjection: seed.objection,
    emotionalTone: seed.tone,
    openingLine: "Hello?",
    voice,
    ...extras,
    ...(plain ? { formNote: plain } : {}),
  };

  if (!isPersonaConfigured()) return fallback;

  try {
    const res = await new Anthropic({ timeout: 25_000, maxRetries: 1 }).messages.parse({
      model: MODEL,
      max_tokens: 800,
      // NB: Haiku 4.5 doesn't support the `effort` param — omit it here.
      output_config: { format: zodOutputFormat(PersonaZ) },
      system:
        "You compose realistic, varied personas for a dental implant/full-arch LEAD that a trainee appointment setter will call for practice. Make a believable, specific person — not a caricature. Use exactly the name, gender and age you're given. The hiddenWhy is the real emotional driver they would NOT volunteer unless the setter does good discovery. The openingLine is how they answer the phone (short, in-character, slightly guarded — they didn't expect the call). The formNote is the short note they left when they asked the practice to contact them (under 25 words, casual, typed or spoken as you're told, no days, dates or times): only their surface situation and what they want — it must NOT mention the hiddenWhy or the objection, not even a hint of the topic (an objection about money means no word about cost), because the setter reads it before the call.",
      messages: [
        {
          role: "user",
          content: `Compose a ${gender} lead named ${name}, age ${age}. Weave in (don't copy verbatim): situation="${seed.situation}", underlying why="${seed.why}", pain level=${seed.pain}, main objection they'll raise="${seed.objection}", tone="${seed.tone}".${DIFFICULTY_HINT[difficulty]}${
            source
              ? ` They reached the practice like this: ${source.asLead.replace(/^You /, "they ")} ${card!.optedIn} — so the formNote is ${source.noteKind === "voicemail" ? "what they SAID in that voicemail" : "what they TYPED on that form"}.`
              : ""
          } Return the persona.`,
        },
      ],
    });
    const o = res.parsed_output;
    if (!o) return fallback;
    // Name, gender, age and voice stay the ones picked here, so they always agree.
    const { formNote, ...rest } = o;
    const persona: Persona = { ...rest, name, gender, age: String(age), voice, ...extras };
    if (!card || !source) return persona;

    // The note goes on the setter's lead card: checked against what the call is
    // meant to uncover, and fixed on its own if it gives either away.
    const note = await guardNote({
      note: formNote,
      realReason: o.hiddenWhy,
      hesitation: o.primaryObjection,
      concern: picked?.key ?? IMPLANT_CONCERNS.find((c) => c.objection === seed.objection)?.key,
      noteKind: source.noteKind,
      fallback: plain!,
    });
    return { ...persona, formNote: note };
  } catch {
    return fallback;
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
  setterFirstName?: string | null,
  difficulty: Difficulty = "ADAPTIVE"
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
${p.card ? `\n${onFileBlock({ card: p.card, note: p.formNote, interest: p.interest })}\n` : ""}
${DIFFICULTY_DIRECTIVE[difficulty]}

HOW TO BEHAVE
- Talk like a real person on the phone: short, natural, sometimes hesitant. One thought at a time.
- Don't be a pushover and don't be impossible. Respond to skill: if the setter builds rapport, listens, uncovers your why, builds real value (not just price), handles your objection well, and asks for a commitment — warm up and be willing to book. If they're pushy, robotic, or skip discovery, stay guarded or non-committal.
- Make them work for the appointment. Only agree to book a consultation if they've genuinely handled your hesitation and given you a reason that matters to YOU.
- The practice's offer: ${office?.offerFraming ?? "a free implant consultation"}. Appointment framing: ${office?.appointmentFraming ?? "a consultation visit"}.
- If you agree to book, confirm it clearly so it's unmistakable ("okay, yes, let's set that up"). If you're not convinced by the end, politely decline or stall.
- Keep the call realistic in length; don't rush to a yes or a no.`;
}
