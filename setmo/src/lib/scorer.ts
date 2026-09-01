import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { IMPLANT_RUBRIC } from "@/lib/skills";

// SetMo's own scorer: reads the call transcript and grades the 8-skill rubric.
// Authoritative + reliable (structured JSON, no prose parsing), and works
// whether or not the agent ran its feedback monologue, and on partial calls.

const MODEL = process.env.SETMO_SCORER_MODEL || "claude-sonnet-4-6";

export function isScorerConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type ScoreTurn = { speaker: "you" | "lead"; text: string; t: number; interrupted?: boolean };

export interface TranscriptScore {
  overallScore: number;
  booked: boolean;
  skills: { skillKey: string; tier: "UNIVERSAL" | "SERVICE_SPECIFIC"; score: number; reasoning: string }[];
  wins: string[];
  misses: string[];
  phrases: { from: string; to: string }[];
  personaCoaching: string | null;
  recommendedNextScenario: string | null;
  narrative: string | null;
}

// Rubric definitions handed to the model (the 8 implant skills).
const RUBRIC_GUIDE = `
1. rapport (Rapport & warmth, universal): genuine human connection, warm tone, put the lead at ease.
2. listening (Listening & empathy, universal): active listening, reflected the lead's words/feelings, didn't talk over.
3. discovery (Discovery — the "why", implant-specific): uncovered the real motivation driving the inquiry.
4. painpoint (Pain-point exploration, implant-specific): explored functional + emotional pain and its consequences.
5. objection (Objection handling, universal): addressed concerns (price, fear, spouse, timing) without being pushy.
6. confidence (Confidence & leadership, universal): led the call with calm, assured authority.
7. value (Value building, implant-specific): tied the outcome to the lead's goals/value, not just price.
8. closing (Closing the appointment, universal): clearly asked for and secured a booked appointment.`;

const SkillZ = z.object({ score: z.number(), reasoning: z.string() });
const ScoreZ = z.object({
  overall: z.number(),
  rapport: SkillZ,
  listening: SkillZ,
  discovery: SkillZ,
  painpoint: SkillZ,
  objection: SkillZ,
  confidence: SkillZ,
  value: SkillZ,
  closing: SkillZ,
  wins: z.array(z.string()),
  misses: z.array(z.string()),
  replacement_phrases: z.array(z.object({ from: z.string(), to: z.string() })),
  persona_coaching: z.string(),
  next_scenario: z.string(),
  narrative: z.string(),
  booked: z.boolean(),
});

const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n * 10) / 10));

// Objective delivery signals derived from turn timing — passed to the model.
function deliveryMetrics(turns: ScoreTurn[]): string {
  const setter = turns.filter((t) => t.speaker === "you");
  const lead = turns.filter((t) => t.speaker === "lead");
  const words = (a: ScoreTurn[]) => a.reduce((s, t) => s + t.text.split(/\s+/).length, 0);
  const setterWords = words(setter);
  const leadWords = words(lead);
  const totalWords = setterWords + leadWords || 1;

  // response latency: gap before the setter answers after the lead speaks
  const gaps: number[] = [];
  for (let i = 1; i < turns.length; i++) {
    if (turns[i].speaker === "you" && turns[i - 1].speaker === "lead") {
      const g = turns[i].t - turns[i - 1].t;
      if (g >= 0 && g < 60) gaps.push(g);
    }
  }
  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  const interruptions = turns.filter((t) => t.interrupted).length;

  return [
    `Setter spoke ${Math.round((setterWords / totalWords) * 100)}% of the words (talk/listen balance).`,
    `Setter turns: ${setter.length}, lead turns: ${lead.length}.`,
    `Avg response latency after the lead: ${avgGap.toFixed(1)}s (longest ${maxGap.toFixed(1)}s).`,
    `Interruptions/overlaps: ${interruptions}.`,
  ].join(" ");
}

export async function scoreTranscript(opts: {
  turns: ScoreTurn[];
  durationSeconds: number;
  office: { name?: string | null; city?: string | null; offerFraming?: string | null };
}): Promise<TranscriptScore | null> {
  if (!isScorerConfigured()) return null;

  const transcriptText = opts.turns
    .map((t) => `${t.speaker === "you" ? "SETTER" : "LEAD"}: ${t.text}`)
    .join("\n");
  if (!transcriptText.trim()) return null;

  const client = new Anthropic();

  const system = `You are SetMo's call-scoring evaluator for dental appointment setters. You grade how well the SETTER (the human trainee) handled a practice call against a fictional AI LEAD. Score each of the 8 rubric skills from 1.0 to 5.0 (one decimal allowed). Be fair but encouraging — this is training. Base scores ONLY on the live appointment-setting conversation. If the transcript contains a post-call feedback/coaching segment by the agent, IGNORE it for scoring. If the call ended early, score only what actually happened.

Rubric:${RUBRIC_GUIDE}

Also write: 2-3 specific "wins" (what the setter did well, concrete), 2-3 "misses" (specific growth areas), 1-3 replacement_phrases ({from: what they said, to: a stronger line}), persona_coaching (how to handle this lead type), next_scenario (a tougher rep to try), and a one-sentence encouraging narrative headline. overall = your holistic 1-5 for the call.

booked: set to true ONLY if the lead actually agreed to / scheduled a consultation appointment by the end of the call (a committed time, "yes I'll come in," or a clearly accepted booking). Set false if no appointment was secured. This is independent of how well the call was handled — a low-scoring call can still book, and a high-scoring call can fail to book.`;

  const user = `Practice: ${opts.office.name ?? "a dental practice"}${opts.office.city ? ` (${opts.office.city})` : ""}. Offer framing: ${opts.office.offerFraming ?? "n/a"}. Call duration: ${Math.round(opts.durationSeconds)}s.

Delivery metrics: ${deliveryMetrics(opts.turns)}

Transcript:
${transcriptText}`;

  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      // `medium` for thorough, consistent 8-skill scoring. Latency (~54s) is no
      // longer a constraint — scoring runs in the background (after(), 300s budget).
      output_config: {
        format: zodOutputFormat(ScoreZ),
        effort: (process.env.SETMO_SCORER_EFFORT as "low" | "medium" | "high" | undefined) || "medium",
      },
      system,
      messages: [{ role: "user", content: user }],
    });
    const o = res.parsed_output;
    if (!o) return null;

    const skillFromKey = (key: string, cell: { score: number; reasoning: string }) => {
      const def = IMPLANT_RUBRIC.find((s) => s.key === key)!;
      return {
        skillKey: key,
        tier: def.tier === "universal" ? ("UNIVERSAL" as const) : ("SERVICE_SPECIFIC" as const),
        score: clamp(cell.score),
        reasoning: cell.reasoning,
      };
    };

    return {
      overallScore: clamp(o.overall),
      booked: o.booked,
      skills: [
        skillFromKey("rapport", o.rapport),
        skillFromKey("listening", o.listening),
        skillFromKey("discovery", o.discovery),
        skillFromKey("painpoint", o.painpoint),
        skillFromKey("objection", o.objection),
        skillFromKey("confidence", o.confidence),
        skillFromKey("value", o.value),
        skillFromKey("closing", o.closing),
      ],
      wins: o.wins.slice(0, 4),
      misses: o.misses.slice(0, 4),
      phrases: o.replacement_phrases.filter((p) => p.from && p.to).slice(0, 3),
      personaCoaching: o.persona_coaching || null,
      recommendedNextScenario: o.next_scenario || null,
      narrative: o.narrative || null,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// LIVE-CALL scorer — grades a REAL call ingested from the client's phone system
// (GHL). Same 8-skill rubric, plus the extended outcome taxonomy (disposition,
// lead-state signals w/ evidence, primary blocker, booked-quality, recovery).
// The transcript is machine speech-to-text (imperfect) and PII-scrubbed.
// ============================================================================

export const LIVE_DISPOSITIONS = ["booked", "soft_booked", "callback_agreed", "follow_up_needed", "declined", "not_a_fit", "no_contact"] as const;
export const LIVE_LEAD_STATES = ["frustrated", "nervous", "busy", "confused", "price_shocked", "skeptical", "hesitant_interested", "eager"] as const;
export const LIVE_BLOCKERS = ["price", "fear", "timing", "decision_maker", "trust", "misunderstanding", "needs_more_info", "setter_error", "none"] as const;

export interface LiveOutcome {
  disposition: (typeof LIVE_DISPOSITIONS)[number];
  leadStates: { state: (typeof LIVE_LEAD_STATES)[number]; evidence: string }[];
  primaryBlocker: (typeof LIVE_BLOCKERS)[number];
  bookedQuality: { commitment: "firm" | "soft"; depositDiscussed: boolean; framedCorrectly: boolean; riskFlags: string[] } | null;
  recoverable: boolean;
  nextAction: string | null;
  transcriptQuality: "good" | "fair" | "poor";
}

export interface LiveTranscriptScore extends TranscriptScore {
  outcome: LiveOutcome;
}

const LiveScoreZ = ScoreZ.extend({
  disposition: z.enum(LIVE_DISPOSITIONS),
  lead_states: z.array(z.object({ state: z.enum(LIVE_LEAD_STATES), evidence: z.string() })),
  primary_blocker: z.enum(LIVE_BLOCKERS),
  booked_commitment: z.enum(["firm", "soft", "none"]),
  deposit_discussed: z.boolean(),
  appointment_framed_correctly: z.boolean(),
  risk_flags: z.array(z.string()),
  recoverable: z.boolean(),
  next_action: z.string(),
  transcript_quality: z.enum(["good", "fair", "poor"]),
});

export async function scoreLiveTranscript(opts: {
  turns: ScoreTurn[];
  durationSeconds: number;
  office: { name?: string | null; city?: string | null; offerFraming?: string | null };
  setterFirstName?: string | null;
}): Promise<LiveTranscriptScore | null> {
  if (!isScorerConfigured()) return null;

  const transcriptText = opts.turns
    .map((t) => `${t.speaker === "you" ? "SETTER" : "LEAD"}: ${t.text}`)
    .join("\n");
  if (!transcriptText.trim()) return null;

  const client = new Anthropic();

  const system = `You are SetMo's call evaluator for dental appointment setters — grading a REAL call between a human SETTER${opts.setterFirstName ? ` (${opts.setterFirstName})` : ""} and a REAL prospective patient (LEAD). This is live-call quality review for a manager, not training role-play.

IMPORTANT context about this transcript:
- It comes from imperfect machine speech-to-text: expect mis-transcribed words, dropped fragments, and run-together phrases. Judge the setter's INTENT and skill from context — never penalize what is plainly a transcription error.
- Personal information has been redacted to tokens like [NAME], [PHONE], [EMAIL]. Treat a token as if the real value was said (e.g. using [NAME] counts as using the lead's name).
- Score each of the 8 rubric skills 1.0-5.0 based only on what actually happened. If the call was short or cut off, score what occurred.

Rubric:${RUBRIC_GUIDE}

Also write: 2-3 specific "wins", 2-3 "misses", 1-3 replacement_phrases ({from: what they said, to: a stronger line}), persona_coaching (how to handle THIS kind of lead next time), next_scenario (a practice rep the setter should run based on this call's gaps), and a one-sentence narrative headline for the manager. overall = your holistic 1-5.

OUTCOME ANALYSIS (the part managers rely on — be precise and evidence-based):
- disposition: what actually happened. booked = committed appointment with a time or clear acceptance; soft_booked = agreed but vague/hedged, no firm time; callback_agreed = lead agreed to a specific follow-up call; follow_up_needed = ended unresolved; declined = lead said no; not_a_fit = never a candidate (wrong number, no need, do-not-call); no_contact = voicemail/no real conversation.
- lead_states: every emotional state the LEAD showed, each with a SHORT verbatim quote from the transcript as evidence. Only states genuinely present.
- primary_blocker: the single biggest reason the call didn't (fully) book — "none" if firmly booked. Use setter_error when the real blocker was the setter (missed close, talked past a buying signal, skipped discovery).
- booked_commitment/deposit_discussed/appointment_framed_correctly/risk_flags: for booked or soft_booked calls, judge the QUALITY of the booking (risk_flags = reasons this might no-show, e.g. "agreed but sounded frustrated"). For non-booked calls use commitment "none", false, false, [].
- recoverable: could a good follow-up still win this lead?
- next_action: ONE concrete recommended next step for this lead (or "" if none).
- transcript_quality: how readable/gradable this transcript is. Use "poor" when garbling is bad enough that scores are guesses — managers see a low-confidence flag.

booked (boolean): true ONLY for a genuinely committed appointment (matches disposition "booked").`;

  const user = `Practice: ${opts.office.name ?? "a dental practice"}${opts.office.city ? ` (${opts.office.city})` : ""}. Offer framing: ${opts.office.offerFraming ?? "n/a"}. Estimated call duration: ${Math.round(opts.durationSeconds)}s.

Delivery metrics (estimated — timings are approximate for live calls): ${deliveryMetrics(opts.turns)}

Transcript:
${transcriptText}`;

  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 5000,
      thinking: { type: "adaptive" },
      output_config: {
        format: zodOutputFormat(LiveScoreZ),
        effort: (process.env.SETMO_SCORER_EFFORT as "low" | "medium" | "high" | undefined) || "medium",
      },
      system,
      messages: [{ role: "user", content: user }],
    });
    const o = res.parsed_output;
    if (!o) return null;

    const skillFromKey = (key: string, cell: { score: number; reasoning: string }) => {
      const def = IMPLANT_RUBRIC.find((s) => s.key === key)!;
      return {
        skillKey: key,
        tier: def.tier === "universal" ? ("UNIVERSAL" as const) : ("SERVICE_SPECIFIC" as const),
        score: clamp(cell.score),
        reasoning: cell.reasoning,
      };
    };

    const bookedish = o.disposition === "booked" || o.disposition === "soft_booked";
    return {
      overallScore: clamp(o.overall),
      booked: o.booked,
      skills: [
        skillFromKey("rapport", o.rapport),
        skillFromKey("listening", o.listening),
        skillFromKey("discovery", o.discovery),
        skillFromKey("painpoint", o.painpoint),
        skillFromKey("objection", o.objection),
        skillFromKey("confidence", o.confidence),
        skillFromKey("value", o.value),
        skillFromKey("closing", o.closing),
      ],
      wins: o.wins.slice(0, 4),
      misses: o.misses.slice(0, 4),
      phrases: o.replacement_phrases.filter((p) => p.from && p.to).slice(0, 3),
      personaCoaching: o.persona_coaching || null,
      recommendedNextScenario: o.next_scenario || null,
      narrative: o.narrative || null,
      outcome: {
        disposition: o.disposition,
        leadStates: o.lead_states.slice(0, 6),
        primaryBlocker: o.primary_blocker,
        bookedQuality: bookedish
          ? { commitment: o.booked_commitment === "none" ? "soft" : o.booked_commitment, depositDiscussed: o.deposit_discussed, framedCorrectly: o.appointment_framed_correctly, riskFlags: o.risk_flags.slice(0, 4) }
          : null,
        recoverable: o.recoverable,
        nextAction: o.next_action || null,
        transcriptQuality: o.transcript_quality,
      },
    };
  } catch {
    return null;
  }
}
