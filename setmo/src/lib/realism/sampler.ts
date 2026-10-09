import { rngFrom, type Rng } from "@/lib/realism/rng";
import { pickName } from "@/lib/realism/names";
import { pickVoiceFor } from "@/lib/realism/voices";
import { DENTITION_AGE } from "@/lib/realism/rules";
import { sampleCardFacts } from "@/lib/realism/lead-card";
import type { CallerRole, Coverage, Dentition, LeadChoice, LeadSkeleton, Urgency } from "@/lib/realism/types";

// ---------------------------------------------------------------------------
// Assembling a lead from compatible parts.
//
// Order matters: the storyline is chosen first, and everything after it is
// drawn from what that storyline allows. A patient's age comes from the
// storyline's own range, the caller's age is derived FROM the patient's, and
// coverage is filtered by the age that was actually drawn. There is no step
// where an incompatible pair could meet.
// ---------------------------------------------------------------------------

export type Situation = string | { text: string; coverage?: Coverage[] };

/** `concern` groups objections for "pick your lead" (cost, insurance, …).
 *  `coverage` limits an objection to the plans it makes sense with — "do you
 *  take the state plan?" from someone on a PPO is a contradiction — and
 *  `notSources` rules out ways of reaching the practice it contradicts. */
export type Objection = {
  text: string;
  difficulty: "WARM" | "ADAPTIVE" | "TOUGH";
  concern?: string;
  coverage?: Coverage[];
  notSources?: string[];
};

export type Archetype = {
  key: string;
  weight: number;
  /** The patient ages this storyline makes sense for. */
  patientAge: [number, number];
  callerRoles: CallerRole[];
  dentition: Dentition[];
  /** Restrict coverage where the storyline demands it (e.g. a benefits-expiring
   *  call only makes sense with insurance). */
  coverage?: Coverage[];
  /** A situation can be limited to the plans it makes sense with. */
  situations: Situation[];
  drivers: string[];
  objections: Objection[];
  urgency: Urgency;
  /** Years since the last dental visit, as a range. null-able storylines (never
   *  been) pass [0,0] and set neverVisited. */
  lastVisit?: [number, number];
  neverVisited?: boolean;
  /** What brought them in, as the lead card says it. */
  interest?: string;
  /** How leads in this storyline usually reach the practice (else the pack's). */
  sources?: { key: string; weight: number }[];
};

export type PersonaSpec = {
  /** Hard bounds for this service. Nothing outside these is ever sampled. */
  patientAge: [number, number];
  callerMix: { role: CallerRole; weight: number }[];
  archetypes: Archetype[];
  tones: string[];
  coverages: { key: Coverage; weight: number }[];
  /** How this service's leads reach the practice (keys into LEAD_SOURCES). */
  leadSources?: { key: string; weight: number }[];
  /** Labels for the objection concern tags, for "pick your lead". */
  concerns?: { key: string; label: string }[];
};

export type SampleOpts = {
  difficulty?: "WARM" | "ADAPTIVE" | "TOUGH";
  /** Voices used on this setter's recent calls, so the same one doesn't repeat. */
  recentVoiceIds?: string[];
  /** What the setter asked for. Only ever narrows the choices — every lead is
   *  still drawn from compatible options. */
  choice?: LeadChoice;
};

/** The patient ages a caller role can hold for, within a range. */
export function roleAgeRange(role: CallerRole, [lo, hi]: [number, number]): [number, number] | null {
  let r: [number, number];
  if (role === "PARENT" || role === "GUARDIAN" || role === "GRANDPARENT") r = [lo, Math.min(hi, 17)];
  else if (role === "ADULT_CHILD" || role === "CAREGIVER") r = [Math.max(lo, 60), hi];
  else r = [Math.max(lo, 18), hi];
  return r[0] <= r[1] ? r : null;
}

/** The storylines that can satisfy a choice. */
export function archetypesFor(spec: PersonaSpec, choice: LeadChoice = {}): Archetype[] {
  return spec.archetypes.filter((a) => {
    const range = clampRange(spec.patientAge, a.patientAge);
    if (range[0] > range[1]) return false;
    if (choice.caller && (!a.callerRoles.includes(choice.caller) || !roleAgeRange(choice.caller, range))) return false;
    if (choice.concern && !a.objections.some((o) => o.concern === choice.concern)) return false;
    return true;
  });
}

const RELATION: Record<CallerRole, string> = {
  SELF: "themselves",
  PARENT: "their child",
  GUARDIAN: "the child they care for",
  GRANDPARENT: "their grandchild",
  SPOUSE: "their spouse",
  ADULT_CHILD: "their parent",
  CAREGIVER: "the person they care for",
};

const clampRange = (a: [number, number], b: [number, number]): [number, number] => [
  Math.max(a[0], b[0]),
  Math.min(a[1], b[1]),
];

/** The caller's own age, derived from the patient's so the relationship holds. */
function callerAge(rng: Rng, role: CallerRole, patientAge: number): number {
  switch (role) {
    case "SELF":
      return patientAge;
    case "PARENT":
      return patientAge + rng.int(22, 44);
    case "GUARDIAN":
      return patientAge + rng.int(20, 48);
    case "GRANDPARENT":
      return patientAge + rng.int(45, 62);
    case "SPOUSE":
      return Math.max(18, patientAge + rng.int(-9, 9));
    case "ADULT_CHILD":
      return Math.max(18, patientAge - rng.int(22, 40));
    case "CAREGIVER":
      return rng.int(28, 60);
  }
}

export function sampleLead(spec: PersonaSpec, seed: string, opts: SampleOpts = {}): LeadSkeleton {
  const rng = rngFrom(seed);
  const choice = opts.choice ?? {};

  // 1. Storyline first — everything else is drawn from what it allows. A choice
  //    from "pick your lead" narrows the storylines to the ones that can satisfy
  //    it; one that nothing can satisfy is ignored rather than forced.
  const eligible = archetypesFor(spec, choice);
  const honored = eligible.length > 0;
  const archetype = rng.weighted((honored ? eligible : spec.archetypes).map((a) => ({ item: a, weight: a.weight })));

  // 2. Patient age: the overlap of the service's bounds and the storyline's
  //    (and, if a caller was picked, the ages that caller can hold for).
  let [ageLo, ageHi] = clampRange(spec.patientAge, archetype.patientAge);
  if (honored && choice.caller) [ageLo, ageHi] = roleAgeRange(choice.caller, [ageLo, ageHi])!;
  const patientAge = rng.int(ageLo, ageHi);

  // 3. Who's on the phone: only roles this storyline allows, and only roles that
  //    can hold for this patient's age (nobody's adult child is 9).
  const allowedRoles = archetype.callerRoles.filter((role) => {
    if (patientAge < 18) return role === "PARENT" || role === "GUARDIAN" || role === "GRANDPARENT";
    if (role === "PARENT" || role === "GUARDIAN" || role === "GRANDPARENT") return false;
    if (role === "ADULT_CHILD" || role === "CAREGIVER") return patientAge >= 60;
    return true;
  });
  const roleWeights = spec.callerMix.filter((c) => allowedRoles.includes(c.role));
  const role: CallerRole =
    honored && choice.caller && allowedRoles.includes(choice.caller)
      ? choice.caller
      : roleWeights.length
        ? rng.weighted(roleWeights.map((c) => ({ item: c.role, weight: c.weight })))
        : allowedRoles[0] ?? "SELF";

  // 4. Mouth: only what's plausible at this age.
  const dentitionOptions = archetype.dentition.filter((d) => {
    const [lo, hi] = DENTITION_AGE[d];
    return patientAge >= lo && patientAge <= hi;
  });
  const dentition = dentitionOptions.length ? rng.pick(dentitionOptions) : "full_natural";

  // 5. Coverage. The hesitation is settled first — the picked concern's, at the
  //    challenge level (or the nearest level that has one) — and the coverage
  //    is then drawn from plans that hesitation AND some situation fit. Drawing
  //    coverage first used to strand a tough storyline whose tough hesitation
  //    needs a particular plan, leaving it only easier ones.
  const base =
    honored && choice.concern ? archetype.objections.filter((o) => o.concern === choice.concern) : archetype.objections;
  const preferred = nearestLevel(base, opts.difficulty);
  const situationFits = (c: Coverage) => archetype.situations.some((s) => fitsPlan(situationCoverage(s), c));
  const ageFit = (archetype.coverage
    ? spec.coverages.filter((c) => archetype.coverage!.includes(c.key))
    : spec.coverages
  ).filter((c) => coverageFits(c.key, patientAge));
  const coverageOptions = firstNonEmpty(
    ageFit.filter((c) => situationFits(c.key) && preferred.some((o) => fitsPlan(o.coverage, c.key))),
    ageFit.filter((c) => situationFits(c.key) && base.some((o) => fitsPlan(o.coverage, c.key))),
    ageFit
  );
  const coverage: Coverage = coverageOptions.length
    ? rng.weighted(coverageOptions.map((c) => ({ item: c.key, weight: c.weight })))
    : "UNINSURED";

  // 6. The people. A picked gender is the CALLER's — the person the setter talks
  //    to. Names fit each person's age.
  const isSelf = role === "SELF";
  const cAge = callerAge(rng, role, patientAge);
  const patientGender: "male" | "female" =
    isSelf && choice.gender ? choice.gender : rng.chance(0.5) ? "male" : "female";
  const patientName = pickName(rng, patientGender, patientAge);
  const callerGender: "male" | "female" = isSelf
    ? patientGender
    : choice.gender ?? (rng.chance(0.5) ? "male" : "female");
  const callerName = isSelf ? patientName : pickName(rng, callerGender, cAge, patientName.firstName);

  // 7. The story. A picked concern chooses WHICH hesitation they bring; the
  //    challenge level still decides how firmly they hold it (the prompt's
  //    directive). Only hesitations that make sense with their coverage.
  const fitsCoverage = (o: Objection) => fitsPlan(o.coverage, coverage);
  const drawn = rng.pick(
    firstNonEmpty(preferred.filter(fitsCoverage), nearestLevel(base.filter(fitsCoverage), opts.difficulty), base)
  );
  const objection = drawn.text;

  const lastVisitRange = archetype.lastVisit ?? [0, Math.max(0, Math.min(12, patientAge - 2))];
  const yearsSinceLastVisit = archetype.neverVisited
    ? null
    : Math.min(rng.int(lastVisitRange[0], lastVisitRange[1]), Math.max(0, patientAge - 2));

  return {
    archetype: archetype.key,
    caller: { ...callerName, age: cAge, gender: callerGender, role },
    patient: {
      ...patientName,
      // The caller speaking for themselves shares one name.
      ...(isSelf ? callerName : {}),
      age: patientAge,
      gender: patientGender,
      relation: RELATION[role],
      dentition,
      speaksOnCall: isSelf,
    },
    coverage,
    // Only situations that fit the plan ("lost coverage a while back" isn't a
    // PPO patient's story).
    situation: situationText(
      rng.pick(firstNonEmpty(archetype.situations.filter((s) => fitsPlan(situationCoverage(s), coverage)), archetype.situations))
    ),
    hiddenWhy: rng.pick(archetype.drivers),
    objection,
    tone: rng.pick(spec.tones),
    urgency: archetype.urgency,
    yearsSinceLastVisit,
    voice: pickVoiceFor(rng, {
      gender: callerGender,
      age: cAge,
      exclude: opts.recentVoiceIds,
    }),
    interest: archetype.interest,
    concern: drawn.concern,
    // How they reached the practice — never a way that contradicts the hesitation
    // (someone who found you on their plan's dentist list doesn't ask whether
    // you're in network).
    card: sampleCardFacts(
      rng,
      (archetype.sources ?? spec.leadSources ?? [{ key: "google_form", weight: 1 }]).filter((s) => !drawn.notSources?.includes(s.key)),
      { coverage }
    ),
  };
}

const LEVEL_ORDER = {
  WARM: ["WARM", "ADAPTIVE", "TOUGH"],
  TOUGH: ["TOUGH", "ADAPTIVE", "WARM"],
} as const;

/** The objections at the requested challenge level, or at the nearest level
 *  that has any (never a jump from tough straight to warm while a middle one
 *  exists). Adaptive draws from all of them. */
export function nearestLevel<T extends { difficulty: "WARM" | "ADAPTIVE" | "TOUGH" }>(pool: T[], difficulty?: "WARM" | "ADAPTIVE" | "TOUGH"): T[] {
  if (!difficulty || difficulty === "ADAPTIVE") return pool;
  for (const level of LEVEL_ORDER[difficulty]) {
    const atLevel = pool.filter((o) => o.difficulty === level);
    if (atLevel.length) return atLevel;
  }
  return pool;
}

/** No list means any plan. */
export const fitsPlan = (plans: Coverage[] | undefined, c: Coverage) => !plans || plans.includes(c);

export const situationText = (s: Situation) => (typeof s === "string" ? s : s.text);
export const situationCoverage = (s: Situation) => (typeof s === "string" ? undefined : s.coverage);

function firstNonEmpty<T>(...lists: T[][]): T[] {
  return lists.find((l) => l.length > 0) ?? [];
}

function coverageFits(coverage: Coverage, patientAge: number): boolean {
  if (coverage === "MEDICARE_ADVANTAGE" || coverage === "MEDICARE_ONLY") return patientAge >= 65;
  if (coverage === "CHIP") return patientAge <= 18;
  if (coverage === "VA") return patientAge >= 18;
  return true;
}
