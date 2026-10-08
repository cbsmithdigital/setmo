// ---------------------------------------------------------------------------
// The shape of an AI lead, before any words are written.
//
// Code picks the FACTS (who's calling, how old the patient is, what's in their
// mouth, what they're covered by) from compatible options only, so an impossible
// lead — braces for a 4-year-old, a toothache in a mouth with no teeth, Medicare
// for a 30-year-old — can't be sampled in the first place. The model is only
// ever asked to write the person, never to decide the facts.
// ---------------------------------------------------------------------------

export type CallerRole =
  | "SELF"
  | "PARENT"
  | "GUARDIAN"
  | "GRANDPARENT"
  | "SPOUSE"
  | "ADULT_CHILD"
  | "CAREGIVER";

export const CALLER_LABEL: Record<CallerRole, string> = {
  SELF: "the patient",
  PARENT: "a parent",
  GUARDIAN: "a legal guardian",
  GRANDPARENT: "a grandparent",
  SPOUSE: "a spouse or partner",
  ADULT_CHILD: "an adult son or daughter",
  CAREGIVER: "a caregiver",
};

export type AgeBand = "0-5" | "6-12" | "13-17" | "18-29" | "30-44" | "45-59" | "60-74" | "75+";

export function ageBand(age: number): AgeBand {
  if (age <= 5) return "0-5";
  if (age <= 12) return "6-12";
  if (age <= 17) return "13-17";
  if (age <= 29) return "18-29";
  if (age <= 44) return "30-44";
  if (age <= 59) return "45-59";
  if (age <= 74) return "60-74";
  return "75+";
}

/** What's actually in the patient's mouth. Shared across every pack so two
 *  services can't disagree about what a denture wearer can have. */
export type Dentition =
  | "primary_child" // baby teeth only (under ~6)
  | "mixed_child" // losing baby teeth, adult teeth coming in (~6–12)
  | "full_natural"
  | "some_missing"
  | "partial_denture"
  | "full_upper_denture"
  | "full_dentures";

export type Coverage =
  | "PPO"
  | "DHMO"
  | "MEDICAID"
  | "CHIP"
  | "MEDICARE_ADVANTAGE"
  | "MEDICARE_ONLY"
  | "VA"
  | "UNINSURED";

export const COVERAGE_LABEL: Record<Coverage, string> = {
  PPO: "a PPO dental plan",
  DHMO: "a DHMO / managed-care plan",
  MEDICAID: "state Medicaid",
  CHIP: "the state children's plan (CHIP)",
  MEDICARE_ADVANTAGE: "a Medicare Advantage plan with a dental allowance",
  MEDICARE_ONLY: "Original Medicare (no dental)",
  VA: "VA benefits",
  UNINSURED: "no dental insurance",
};

/** How the person would write their coverage on an intake form — which isn't
 *  always what they actually have (someone on Original Medicare writes
 *  "Medicare", not "no dental coverage"; finding that out is the setter's job). */
export const COVERAGE_AS_LISTED: Record<Coverage, string> = {
  PPO: "PPO plan",
  DHMO: "DHMO plan",
  MEDICAID: "Medicaid",
  CHIP: "CHIP",
  MEDICARE_ADVANTAGE: "Medicare Advantage",
  MEDICARE_ONLY: "Medicare",
  VA: "VA",
  UNINSURED: "None",
};

export type Urgency = "none" | "soon" | "urgent";

/** What the practice already had on the lead before the setter dialed — the
 *  CRM view. Sampled in code like every other fact, so the card a setter reads
 *  and the person who answers can't disagree. */
export type CardFacts = {
  /** Key into LEAD_SOURCES. */
  source: string;
  /** When they reached out, relative to the call ("last night"). */
  optedIn: string;
  /** Earlier attempts to reach them that went unanswered. */
  attempts: 0 | 1 | 2;
  /** A "call them back" after a dropped call — they spoke minutes ago. */
  callback?: boolean;
};

export type Person = {
  firstName: string;
  lastName: string;
  age: number;
  gender: "male" | "female";
};

export type LeadSkeleton = {
  /** Which storyline this lead came from — kept for variety tracking. */
  archetype: string;
  caller: Person & { role: CallerRole };
  patient: Person & {
    /** How the patient relates to the caller, in plain words ("your daughter"). */
    relation: string;
    dentition: Dentition;
    /** A patient who isn't the caller never speaks on the call. */
    speaksOnCall: boolean;
  };
  coverage: Coverage;
  situation: string;
  hiddenWhy: string;
  objection: string;
  tone: string;
  urgency: Urgency;
  /** null = has never been to a dentist. */
  yearsSinceLastVisit: number | null;
  voice: { id: string; name: string; band: AgeBand; bandMatched: boolean };
  /** What brought them in, in a setter's words ("A tooth that's bothering them"). */
  interest?: string;
  /** The CRM facts. Leads composed before the lead card existed have none. */
  card?: CardFacts;
  /** The concern tag of the objection drawn, when the pack tags its objections. */
  concern?: string;
};

/** What a setter can ask for in "pick your lead". Anything left out is drawn as
 *  usual. Choosing never makes a lead easier — the challenge level does that. */
export type LeadChoice = {
  gender?: "male" | "female";
  /** Implant only: an age range key ("40s-50s", "60s", "70s"). */
  age?: string;
  /** Who's on the phone (packs only). */
  caller?: CallerRole;
  /** The hesitation they'll bring (a concern key). */
  concern?: string;
};

export type Violation = { rule: string; detail: string };
