import type { ServiceKey } from "@/generated/prisma/client";
import type { PersonaSpec } from "@/lib/realism/sampler";
import type { LexiconOpts } from "@/lib/realism/lexicon";

// ---------------------------------------------------------------------------
// Service packs: everything that makes one kind of dental call its own thing —
// the rubric it's graded on, what "booked" means, and (as each pack ships) the
// lead ingredients and rules that keep its AI leads realistic.
//
// Packs live in CODE, not the database: what a score MEANS and what's safe to
// generate must be reviewable, versioned and testable. Per-office settings
// (which services are offered, the practice's own wording) stay in the DB.
// ---------------------------------------------------------------------------

export type SkillTierKey = "universal" | "service_specific";

export interface RubricSkill {
  key: string;
  name: string;
  /** Compact label for dense grids (heatmap headers). */
  short: string;
  tier: SkillTierKey;
  /** What the grader listens for — this text goes into the scoring prompt. */
  guide: string;
}

export interface Rubric {
  /** Stable id stored on every evaluation, e.g. "implant.v1". A rubric's skills
   *  and anchors are frozen once calls have been scored against it; meaningful
   *  changes get a new version so history keeps reading correctly. */
  id: string;
  /** Scoring family. Service skills only ever compare within a family — two
   *  services must never reuse a skill key to mean different things. */
  family: string;
  skills: RubricSkill[];
  /** What counts as a booked appointment on this kind of call. */
  bookedDefinition: string;
}

export interface ServicePack {
  service: ServiceKey;
  /** Picker name. */
  name: string;
  blurb: string;
  /** Indicative case value, for the picker and outcome projections. */
  caseValue: string;
  /** One line describing what the caller is phoning about, in their terms —
   *  goes into the lead prompt. */
  callAbout?: string;
  /** What the practice offers on this kind of call, as the lead hears it. The
   *  office's own offer wording is written for the implant call (often an
   *  implant promotion), so every other call type brings its own. */
  offer?: string;
  /** The appointment this call is trying to book, in plain words. */
  appointment?: string;
  /** What the practice's ads for this call type promise — on the lead card and
   *  in the lead's memory when they came in through an ad. */
  adOffer?: string;
  /** Wording rules for this call type's leads (the default bans implant terms). */
  lexicon?: LexiconOpts;
  rubric: Rubric;
  /** How this service's leads are built. The implant pack has none — it keeps
   *  its original generator untouched. */
  persona?: PersonaSpec;
}

export const SKILL_TIER_DB = {
  universal: "UNIVERSAL",
  service_specific: "SERVICE_SPECIFIC",
} as const;
