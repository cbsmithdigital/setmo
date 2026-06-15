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
