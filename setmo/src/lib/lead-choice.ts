import { z } from "zod";
import { IMPLANT_AGES, IMPLANT_CONCERNS } from "@/lib/personas";
import { packFor } from "@/lib/packs/registry";
import { archetypesFor } from "@/lib/realism/sampler";
import type { CallerRole, LeadChoice } from "@/lib/realism/types";

// ---------------------------------------------------------------------------
// "Pick your lead": the options a setter can choose from before a call, per call
// type, and the server-side check that a choice is one the lead builder can
// actually satisfy. A choice narrows WHO calls and WHICH hesitation they bring;
// how firmly they hold it stays with the challenge level.
// ---------------------------------------------------------------------------

export type ChoiceOption = { key: string; label: string };
export type LeadChoiceOptions = {
  /** Implant: an age range. */
  ages?: ChoiceOption[];
  /** Packs: who's on the phone. */
  callers?: ChoiceOption[];
  concerns: ChoiceOption[];
  /** Packs: the concerns that can come with each caller — the rest are greyed out. */
  concernsByCaller?: Record<string, string[]>;
  /** Implant: the concerns that make sense at each age range. */
  concernsByAge?: Record<string, string[]>;
};

const CALLER_CHOICES: { key: CallerRole; label: string }[] = [
  { key: "SELF", label: "The patient" },
  { key: "PARENT", label: "A parent, for their child" },
  { key: "SPOUSE", label: "A spouse or partner" },
  { key: "ADULT_CHILD", label: "An adult child, for their parent" },
];

const GENDER_LABEL = { male: "Man", female: "Woman" } as const;

/** What can be picked for this call type, or null when it has no options. */
export function leadChoiceOptions(serviceType: string): LeadChoiceOptions | null {
  if (serviceType === "IMPLANT") {
    return {
      ages: IMPLANT_AGES.map(({ key, label }) => ({ key, label })),
      concerns: IMPLANT_CONCERNS.map(({ key, label }) => ({ key, label })),
      concernsByAge: Object.fromEntries(
        IMPLANT_AGES.map((a) => [a.key, IMPLANT_CONCERNS.map((c) => c.key).filter((k) => !a.excludes?.includes(k))])
      ),
    };
  }
  const spec = packFor(serviceType)?.persona;
  if (!spec?.concerns?.length) return null;
  const callers = CALLER_CHOICES.filter(
    (c) => spec.callerMix.some((m) => m.role === c.key) && archetypesFor(spec, { caller: c.key }).length > 0
  );
  const concerns = spec.concerns.filter((c) => archetypesFor(spec, { concern: c.key }).length > 0);
  const concernsByCaller: Record<string, string[]> = {};
  for (const caller of callers) {
    concernsByCaller[caller.key] = concerns
      .filter((c) => archetypesFor(spec, { caller: caller.key, concern: c.key }).length > 0)
      .map((c) => c.key);
  }
  return { callers, concerns, concernsByCaller };
}

export const LeadChoiceZ = z
  .object({
    gender: z.enum(["male", "female"]).optional(),
    age: z.string().max(20).optional(),
    caller: z.string().max(20).optional(),
    concern: z.string().max(30).optional(),
  })
  .strict();

/**
 * The choice, checked against what this call type offers and what its lead
 * builder can satisfy together. Returns null for "surprise me" (nothing picked);
 * throws a readable message for a choice that can't be built.
 */
export function validateLeadChoice(serviceType: string, raw: unknown): LeadChoice | null {
  if (raw == null) return null;
  const parsed = LeadChoiceZ.safeParse(raw);
  if (!parsed.success) throw new Error("That lead choice isn't valid.");
  const c = parsed.data;
  if (!c.age && !c.caller && !c.concern && !c.gender) return null;

  const opts = leadChoiceOptions(serviceType);
  if (!opts) throw new Error("This call type doesn't offer lead choices yet.");
  const choice: LeadChoice = {};
  if (c.gender) choice.gender = c.gender;
  if (c.age) {
    if (!opts.ages?.some((a) => a.key === c.age)) throw new Error("That age range isn't available for this call type.");
    choice.age = c.age;
  }
  if (c.caller) {
    if (!opts.callers?.some((x) => x.key === c.caller)) throw new Error("That caller isn't available for this call type.");
    choice.caller = c.caller as CallerRole;
  }
  if (c.concern) {
    if (!opts.concerns.some((x) => x.key === c.concern)) throw new Error("That concern isn't available for this call type.");
    choice.concern = c.concern;
  }
  if (choice.caller && choice.concern && !opts.concernsByCaller?.[choice.caller]?.includes(choice.concern)) {
    throw new Error("That caller and concern don't go together — pick another concern.");
  }
  if (choice.age && choice.concern && opts.concernsByAge && !opts.concernsByAge[choice.age]?.includes(choice.concern)) {
    throw new Error("That age and concern don't go together — pick another concern.");
  }
  return Object.keys(choice).length ? choice : null;
}

/** "Woman · 60s · Cost" — stored on the session for the card and the reveal. */
export function leadChoiceLabel(serviceType: string, choice: LeadChoice | null): string | null {
  if (!choice) return null;
  const opts = leadChoiceOptions(serviceType);
  const parts = [
    choice.caller ? opts?.callers?.find((c) => c.key === choice.caller)?.label : null,
    choice.gender ? GENDER_LABEL[choice.gender] : null,
    choice.age ? opts?.ages?.find((a) => a.key === choice.age)?.label : null,
    choice.concern ? opts?.concerns.find((c) => c.key === choice.concern)?.label : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
