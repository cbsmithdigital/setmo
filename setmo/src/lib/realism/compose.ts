import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { checkProse, type LexiconOpts } from "@/lib/realism/lexicon";
import { CALLER_LABEL, COVERAGE_LABEL, type LeadSkeleton } from "@/lib/realism/types";

// ---------------------------------------------------------------------------
// Turning a set of facts into a person.
//
// The model writes ONLY prose — how this person sounds, how they answer the
// phone, the words they'd use about their own situation. Every fact it's given
// is fixed, and anything it writes is checked against those facts before a
// setter hears it. If the writing fails the check it's rewritten once, and if
// that fails too the lead falls back to plain template wording. A setter never
// meets an unchecked lead.
// ---------------------------------------------------------------------------

const MODEL = process.env.SETMO_PERSONA_MODEL || "claude-haiku-4-5";

const ProseZ = z.object({
  openingLine: z.string(),
  background: z.string(),
  hiddenWhyInTheirWords: z.string(),
  objectionInTheirWords: z.string(),
});
export type LeadProse = z.infer<typeof ProseZ>;

export type ComposeCtx = {
  skeleton: LeadSkeleton;
  /** What this service's call is about, in one line. */
  callAbout: string;
  office: { name?: string | null; city?: string | null };
  lexicon?: LexiconOpts;
};

/** Plain wording that always satisfies the checks — the floor under the model. */
export function templateProse(s: LeadSkeleton, callAbout: string): LeadProse {
  const who = s.caller.role === "SELF" ? "I" : `my ${s.patient.relation.replace("their ", "")}`;
  return {
    openingLine: "Hello?",
    background:
      s.caller.role === "SELF"
        ? `${s.situation}. I'm calling about ${callAbout}.`
        : `I'm calling about ${s.patient.firstName}, ${s.patient.relation.replace("their ", "my ")}. ${s.situation}.`,
    hiddenWhyInTheirWords: s.hiddenWhy,
    objectionInTheirWords: `${who === "I" ? "I" : who} — ${s.objection}.`,
  };
}

function factSheet(s: LeadSkeleton, callAbout: string, office: ComposeCtx["office"]): string {
  const patientLine =
    s.caller.role === "SELF"
      ? `You are the patient, ${s.caller.firstName} ${s.caller.lastName}, age ${s.patient.age}.`
      : `You are ${s.caller.firstName} ${s.caller.lastName}, age ${s.caller.age}, calling as ${CALLER_LABEL[s.caller.role]} about ${s.patient.firstName}, age ${s.patient.age}. ${s.patient.firstName} is NOT on the phone and will not come to the phone.`;
  return [
    patientLine,
    `Calling ${office.name ?? "a dental practice"}${office.city ? ` in ${office.city}` : ""} about ${callAbout}.`,
    `Situation: ${s.situation}.`,
    `The real reason underneath (not volunteered): ${s.hiddenWhy}.`,
    `The hesitation you'll raise: ${s.objection}.`,
    `How you come across: ${s.tone}.`,
    `Coverage: ${COVERAGE_LABEL[s.coverage]}.`,
    s.yearsSinceLastVisit == null
      ? "Never been to a dentist."
      : `Last dental visit: ${s.yearsSinceLastVisit === 0 ? "within the last year" : `about ${s.yearsSinceLastVisit} years ago`}.`,
  ].join("\n");
}

export async function composeLead(ctx: ComposeCtx): Promise<{ prose: LeadProse; source: "model" | "repaired" | "template" }> {
  const { skeleton, callAbout, office } = ctx;
  const fallback = templateProse(skeleton, callAbout);
  if (!process.env.ANTHROPIC_API_KEY) return { prose: fallback, source: "template" };

  const system = `You write the VOICE of a person calling a dental practice, for a training role-play. You are given their facts. Your job is only to make them sound like a real person on the phone.

Rules:
- Never change, add to, or contradict a fact you were given — not ages, not who is on the phone, not insurance.
- Never invent a dentist's name, a brand, a chain, or a price.
- Never write the patient as speaking when they are not the caller.
- Keep it short and spoken, the way people actually talk on the phone. No stage directions.
- openingLine: how they answer or open the call — a handful of words, in character.
- background: two or three sentences, first person, about why they're calling.
- hiddenWhyInTheirWords: the deeper reason, as they'd say it IF the setter earned it.
- objectionInTheirWords: their hesitation, in their own words, one sentence.`;

  const user = `${factSheet(skeleton, callAbout, office)}\n\nWrite this person.`;

  const attempt = async (extra?: string): Promise<LeadProse | null> => {
    try {
      const res = await new Anthropic().messages.parse({
        model: MODEL,
        max_tokens: 700,
        // NB: Haiku 4.5 doesn't support the `effort` param — omit it here.
        output_config: { format: zodOutputFormat(ProseZ) },
        system,
        messages: [{ role: "user", content: extra ? `${user}\n\n${extra}` : user }],
      });
      return res.parsed_output ?? null;
    } catch {
      return null;
    }
  };

  const first = await attempt();
  if (!first) return { prose: fallback, source: "template" };

  const joined = (p: LeadProse) => Object.values(p).join("\n");
  const problems = checkProse(joined(first), skeleton, ctx.lexicon);
  if (!problems.length) return { prose: first, source: "model" };

  const repaired = await attempt(
    `Your last version was rejected: ${problems.map((p) => p.detail).join("; ")}. Rewrite it without those problems, changing nothing else.`
  );
  if (repaired && !checkProse(joined(repaired), skeleton, ctx.lexicon).length) {
    return { prose: repaired, source: "repaired" };
  }
  return { prose: fallback, source: "template" };
}
