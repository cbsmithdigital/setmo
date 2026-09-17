import { rngFrom, type Rng } from "@/lib/realism/rng";
import { pickName } from "@/lib/realism/names";
import { pickVoiceFor } from "@/lib/realism/voices";
import { DENTITION_AGE } from "@/lib/realism/rules";
import { ageBand, type CallerRole, type Coverage, type Dentition, type LeadSkeleton, type Urgency } from "@/lib/realism/types";

// ---------------------------------------------------------------------------
// Assembling a lead from compatible parts.
//
// Order matters: the storyline is chosen first, and everything after it is
// drawn from what that storyline allows. A patient's age comes from the
// storyline's own range, the caller's age is derived FROM the patient's, and
// coverage is filtered by the age that was actually drawn. There is no step
// where an incompatible pair could meet.
// ---------------------------------------------------------------------------

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
  situations: string[];
  drivers: string[];
  objections: { text: string; difficulty: "WARM" | "ADAPTIVE" | "TOUGH" }[];
  urgency: Urgency;
  /** Years since the last dental visit, as a range. null-able storylines (never
   *  been) pass [0,0] and set neverVisited. */
  lastVisit?: [number, number];
  neverVisited?: boolean;
};

export type PersonaSpec = {
  /** Hard bounds for this service. Nothing outside these is ever sampled. */
  patientAge: [number, number];
  callerMix: { role: CallerRole; weight: number }[];
  archetypes: Archetype[];
  tones: string[];
  coverages: { key: Coverage; weight: number }[];
};

export type SampleOpts = {
  difficulty?: "WARM" | "ADAPTIVE" | "TOUGH";
  /** Voices used on this setter's recent calls, so the same one doesn't repeat. */
  recentVoiceIds?: string[];
};

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

  // 1. Storyline first — everything else is drawn from what it allows.
  const archetype = rng.weighted(spec.archetypes.map((a) => ({ item: a, weight: a.weight })));

  // 2. Patient age: the overlap of the service's bounds and the storyline's.
  const [ageLo, ageHi] = clampRange(spec.patientAge, archetype.patientAge);
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
  const role: CallerRole = roleWeights.length
    ? rng.weighted(roleWeights.map((c) => ({ item: c.role, weight: c.weight })))
    : allowedRoles[0] ?? "SELF";

  // 4. Mouth: only what's plausible at this age.
  const dentitionOptions = archetype.dentition.filter((d) => {
    const [lo, hi] = DENTITION_AGE[d];
    return patientAge >= lo && patientAge <= hi;
  });
  const dentition = dentitionOptions.length ? rng.pick(dentitionOptions) : "full_natural";

  // 5. Coverage: filtered by the age actually drawn, then by the storyline.
  const coverageOptions = (archetype.coverage
    ? spec.coverages.filter((c) => archetype.coverage!.includes(c.key))
    : spec.coverages
  ).filter((c) => coverageFits(c.key, patientAge));
  const coverage: Coverage = coverageOptions.length
    ? rng.weighted(coverageOptions.map((c) => ({ item: c.key, weight: c.weight })))
    : "UNINSURED";

  // 6. The people.
  const patientGender = rng.chance(0.5) ? "male" : "female";
  const patientName = pickName(rng, patientGender);
  const isSelf = role === "SELF";
  const callerGender = isSelf ? patientGender : rng.chance(0.5) ? "male" : "female";
  let callerName = isSelf ? patientName : pickName(rng, callerGender);
  if (!isSelf && callerName.firstName === patientName.firstName) {
    callerName = { ...callerName, firstName: pickName(rng, callerGender).firstName };
  }
  const cAge = callerAge(rng, role, patientAge);

  // 7. The story.
  const objections = archetype.objections.filter(
    (o) => !opts.difficulty || opts.difficulty === "ADAPTIVE" || o.difficulty === opts.difficulty
  );
  const objection = (objections.length ? rng.pick(objections) : rng.pick(archetype.objections)).text;

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
    situation: rng.pick(archetype.situations),
    hiddenWhy: rng.pick(archetype.drivers),
    objection,
    tone: rng.pick(spec.tones),
    urgency: archetype.urgency,
    yearsSinceLastVisit,
    voice: pickVoiceFor(rng, {
      gender: callerGender,
      band: ageBand(cAge),
      exclude: opts.recentVoiceIds,
    }),
  };
}

function coverageFits(coverage: Coverage, patientAge: number): boolean {
  if (coverage === "MEDICARE_ADVANTAGE" || coverage === "MEDICARE_ONLY") return patientAge >= 65;
  if (coverage === "CHIP") return patientAge <= 18;
  if (coverage === "VA") return patientAge >= 18;
  return true;
}
