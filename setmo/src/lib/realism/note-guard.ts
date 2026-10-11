import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { noteGivesConcernAway } from "@/lib/realism/lead-card";

// ---------------------------------------------------------------------------
// The note on the lead card is read BEFORE the call, so it must not give away
// what the call is meant to uncover: the real reason they reached out, or the
// hesitation they'll raise. Word lists alone can't judge that — "terrified of
// the chair" and "do you take my plan?" say it without any obvious keyword, and
// "schedule a cleaning" says nothing at all — so a quick model check reads the
// note against both and, if it gives either away, rewrites just that part.
// Plain word checks stay behind it as a backstop, and a note that still trips
// them is replaced with a plain one.
// ---------------------------------------------------------------------------

const MODEL = process.env.SETMO_PERSONA_MODEL || "claude-haiku-4-5";

const GuardZ = z.object({
  reveals: z.boolean(),
  safeNote: z.string(),
});

const STOPWORDS = new Set(
  "a an and are as at be but by for from had has have i i'd i'm i've if in is it it's just me my of on or so that the their them they this to want was we were what when will with would you your".split(" ")
);

/** A run of four words, at least two of them real content words, that both
 *  texts share — a note repeating the hidden reason word for word. Filler like
 *  "i just want to" doesn't count. */
export function sharedRun(a: string, b: string): string | null {
  const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
  const runs = (w: string[]) => {
    const out = new Set<string>();
    for (let i = 0; i + 4 <= w.length; i++) {
      const run = w.slice(i, i + 4);
      if (run.filter((x) => !STOPWORDS.has(x)).length >= 2) out.add(run.join(" "));
    }
    return out;
  };
  const theirs = runs(words(b));
  for (const r of runs(words(a))) if (theirs.has(r)) return r;
  return null;
}

/** The plain checks: why this note still gives something away, or null. */
export function noteBackstop(note: string, opts: { realReason: string; hesitation: string; concern?: string | null }): string | null {
  const repeat = sharedRun(note, opts.realReason) ?? sharedRun(note, opts.hesitation);
  if (repeat) return `it repeats "${repeat}"`;
  return noteGivesConcernAway(note, opts.concern);
}

/**
 * A note that's safe to show on the lead card. Returns the note as written when
 * it gives nothing away, a minimally rewritten one when it did, and `fallback`
 * when neither can be trusted.
 */
export async function guardNote(opts: {
  note: string;
  realReason: string;
  hesitation: string;
  concern?: string | null;
  noteKind: "form" | "voicemail";
  fallback: string;
}): Promise<string> {
  let note = opts.note.trim();
  if (!note) return opts.fallback;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await new Anthropic({ timeout: 15_000, maxRetries: 1 }).messages.parse({
        model: MODEL,
        max_tokens: 300,
        // NB: Haiku 4.5 doesn't support the `effort` param — omit it here.
        output_config: { format: zodOutputFormat(GuardZ) },
        system: `A dental practice's lead left a short ${opts.noteKind === "voicemail" ? "voicemail" : "note on a contact form"}. A trainee appointment setter reads it on the lead card BEFORE calling them. The point of the call is for the trainee to uncover two things the lead keeps to themselves:
1. the real reason underneath: ${opts.realReason}
2. the hesitation they'll raise: ${opts.hesitation}

Decide whether the note reveals or clearly hints at either one. Mentioning the surface situation (what's wrong with their teeth, what kind of visit they want) is fine. Naming or hinting at the hesitation's topic is not (for example, any mention of cost when the hesitation is about money; of a spouse when it's about a spouse; of being nervous when it's about nerves; of insurance or networks when it's about insurance; of whether the treatment is really necessary, or could be avoided or handled another way, when it's about doubting the need; of how long it takes or how many visits when it's about time; of other offices, cheaper options or at-home kits when it's about shopping around; of looking fake or unnatural when it's about how it will look; of wanting it done at the first visit or the same day when that's the hesitation).

reveals: true or false.
safeNote: if reveals is false, the note exactly as written. If true, the same note in the same voice with only the revealing part removed — no new facts, still sounding like a real person.`,
        messages: [{ role: "user", content: note }],
      });
      const out = res.parsed_output;
      if (out?.safeNote?.trim()) note = out.safeNote.trim();
    } catch {
      /* the backstop below still runs */
    }
  }

  return noteBackstop(note, opts) ? opts.fallback : note;
}
