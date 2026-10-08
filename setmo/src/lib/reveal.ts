import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ScoreTurn } from "@/lib/scorer";

// ---------------------------------------------------------------------------
// After the call, the results page reveals who the lead really was. This check
// adds the part that makes the reveal useful: whether the setter actually got
// to the real reason and how the hesitation went — with the moment it happened.
// It runs after scoring, separately from it, so it never touches the scores.
// ---------------------------------------------------------------------------

const MODEL = process.env.SETMO_PERSONA_MODEL || "claude-haiku-4-5";

const RevealZ = z.object({
  why: z.object({ found: z.enum(["yes", "partly", "no"]), note: z.string() }),
  hesitation: z.object({ handled: z.enum(["yes", "partly", "no", "not_raised"]), note: z.string() }),
});
export type RevealCheck = z.infer<typeof RevealZ>;

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export async function checkReveal(opts: {
  turns: ScoreTurn[];
  realReason: string;
  hesitation: string;
}): Promise<RevealCheck | null> {
  if (!process.env.ANTHROPIC_API_KEY || !opts.turns.length) return null;
  const transcript = opts.turns.map((t) => `[${mmss(t.t)}] ${t.speaker === "you" ? "SETTER" : "LEAD"}: ${t.text}`).join("\n");

  const system = `You review a practice phone call between a dental appointment SETTER (a trainee) and an AI LEAD playing a person. You are told the two things the lead was holding back. Judge only what happened in the transcript.

why.found:
- "yes" — the real reason came out (the lead said it, or clearly the same thing) AND the setter noticed it: reflected it back, asked about it, or tied the visit to it.
- "partly" — it came out but the setter didn't pick up on it, or only a surface version of it came out.
- "no" — it never came out.

hesitation.handled:
- "yes" — the lead raised it and the setter answered it in a way that moved the lead forward.
- "partly" — the setter answered it but the lead stayed unconvinced, or it was brushed past.
- "no" — the lead raised it and the setter didn't really address it.
- "not_raised" — it never came up.

Each note is ONE short sentence written to the setter ("you"), pointing at the moment with its timestamp when there is one — for example: "At 2:10 she mentioned her daughter's wedding and you tied the visit to it." Don't grade the rest of the call.`;

  try {
    // Bounded: it runs inside scoring, and a slow answer must never keep a call
    // from being marked scored.
    const res = await new Anthropic({ timeout: 20_000, maxRetries: 1 }).messages.parse({
      model: MODEL,
      max_tokens: 500,
      // NB: Haiku 4.5 doesn't support the `effort` param — omit it here.
      output_config: { format: zodOutputFormat(RevealZ) },
      system,
      messages: [
        {
          role: "user",
          content: `The lead's real reason (not volunteered): ${opts.realReason}\nThe lead's hesitation: ${opts.hesitation}\n\nTranscript:\n${transcript}`,
        },
      ],
    });
    return res.parsed_output ?? null;
  } catch {
    return null;
  }
}
