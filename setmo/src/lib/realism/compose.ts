import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { checkProse, type LexiconOpts } from "@/lib/realism/lexicon";
import { LEAD_SOURCES, plainNote } from "@/lib/realism/lead-card";
import { guardNote } from "@/lib/realism/note-guard";
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
  // What they typed on the form (or said in their voicemail) — shown to the
  // setter on the lead card, so it must never give away the two lines above.
  formNote: z.string(),
});
/** Leads composed before the lead card existed have no formNote. */
export type LeadProse = Omit<z.infer<typeof ProseZ>, "formNote"> & { formNote?: string };

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
        ? `${s.situation}. I reached out about ${callAbout}.`
        : `I reached out about ${s.patient.firstName}, ${s.patient.relation.replace("their ", "my ")}. ${s.situation}.`,
    hiddenWhyInTheirWords: s.hiddenWhy,
    objectionInTheirWords: `${who === "I" ? "I" : who} — ${s.objection}.`,
    formNote: plainNote({
      noteKind: noteKindOf(s),
      forName: s.caller.role === "SELF" ? null : s.patient.firstName,
      newPatient: /new patient/i.test(callAbout),
    }),
  };
}

const noteKindOf = (s: LeadSkeleton) => (LEAD_SOURCES[s.card?.source ?? ""] ?? LEAD_SOURCES.google_form).noteKind;

function factSheet(s: LeadSkeleton, callAbout: string, office: ComposeCtx["office"]): string {
  const patientLine =
    s.caller.role === "SELF"
      ? `You are the patient, ${s.caller.firstName} ${s.caller.lastName}, age ${s.patient.age}.`
      : `You are ${s.caller.firstName} ${s.caller.lastName}, age ${s.caller.age}, ${CALLER_LABEL[s.caller.role]}, who reached out about ${s.patient.firstName}, age ${s.patient.age}. ${s.patient.firstName} is NOT on the phone and will not come to the phone.`;
  return [
    patientLine,
    `Reached out to ${office.name ?? "a dental practice"}${office.city ? ` in ${office.city}` : ""} about ${callAbout}, and the practice is now calling them back.`,
    `Situation: ${s.situation}.`,
    `The real reason underneath (not volunteered): ${s.hiddenWhy}.`,
    `The hesitation you'll raise: ${s.objection}.`,
    `How you come across: ${s.tone}.`,
    `Coverage: ${COVERAGE_LABEL[s.coverage]}.`,
    s.yearsSinceLastVisit == null
      ? "Never been to a dentist."
      : `Last dental visit: ${s.yearsSinceLastVisit === 0 ? "within the last year" : `about ${s.yearsSinceLastVisit} years ago`}.`,
    ...(s.card
      ? [
          `How you reached the practice: ${(LEAD_SOURCES[s.card.source] ?? LEAD_SOURCES.google_form).asLead} ${s.card.optedIn} — so the formNote is ${
            (LEAD_SOURCES[s.card.source] ?? LEAD_SOURCES.google_form).noteKind === "voicemail" ? "what you said in that voicemail" : "what you typed on that form"
          }.`,
        ]
      : []),
  ].join("\n");
}

export async function composeLead(ctx: ComposeCtx): Promise<{ prose: LeadProse; source: "model" | "repaired" | "template" }> {
  const { skeleton, callAbout, office } = ctx;
  const fallback = templateProse(skeleton, callAbout);
  if (!process.env.ANTHROPIC_API_KEY) return { prose: fallback, source: "template" };

  const system = `You write the VOICE of a person who reached out to a dental practice and is now getting a call back from it, for a training role-play. You are given their facts. Your job is only to make them sound like a real person on the phone.

Rules:
- Never change, add to, or contradict a fact you were given — not ages, not who is on the phone, not insurance.
- Never invent a dentist's name, a brand, a chain, or a price.
- Never write the patient as speaking when they are not the caller.
- Keep it short and spoken, the way people actually talk on the phone. No stage directions.
- openingLine: how they answer their phone when the practice calls — a handful of words, in character (the practice is calling them; they didn't place this call).
- background: two or three sentences, first person, about why they reached out.
- hiddenWhyInTheirWords: the deeper reason, as they'd say it IF the setter earned it.
- objectionInTheirWords: their hesitation, in their own words, one sentence.
- formNote: the short note they left when they reached out — under 25 words, casual, the way people actually type into a form or talk on a voicemail. Only the surface situation and what they want. No days, dates or times (the practice's records already say when). It must NOT mention the deeper reason or the hesitation, not even a hint of the topic (if the hesitation is about money, the note says nothing about cost; if it's about scheduling, nothing about times): the setter reads this note before the call, and finding those two out is the whole point of the call.`;

  const user = `${factSheet(skeleton, callAbout, office)}\n\nWrite this person.`;

  const attempt = async (extra?: string): Promise<LeadProse | null> => {
    try {
      const res = await new Anthropic({ timeout: 25_000, maxRetries: 1 }).messages.parse({
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
  const problemsOf = (p: LeadProse) => checkProse(joined(p), skeleton, ctx.lexicon).map((v) => v.detail);

  let chosen: LeadProse = first;
  let source: "model" | "repaired" = "model";
  const problems = problemsOf(first);
  if (problems.length) {
    const repaired = await attempt(
      `Your last version was rejected: ${problems.join("; ")}. Rewrite it without those problems, changing nothing else.`
    );
    if (!repaired || problemsOf(repaired).length) return { prose: fallback, source: "template" };
    chosen = repaired;
    source = "repaired";
  }

  // The note goes on the lead card the setter reads first: checked separately
  // against what the call is meant to uncover, and fixed on its own if needed,
  // so a revealing note never costs the rest of the person's voice.
  const formNote = await guardNote({
    note: chosen.formNote ?? "",
    realReason: chosen.hiddenWhyInTheirWords,
    hesitation: chosen.objectionInTheirWords,
    concern: skeleton.concern,
    noteKind: noteKindOf(skeleton),
    fallback: fallback.formNote!,
  });
  return { prose: { ...chosen, formNote }, source };
}
