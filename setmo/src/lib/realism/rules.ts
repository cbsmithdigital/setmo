import type { Dentition, LeadSkeleton, Violation } from "@/lib/realism/types";

// ---------------------------------------------------------------------------
// The hard rules every generated lead must satisfy, whatever service it's for.
// The sampler is built so these can't fire; they run anyway on every lead, and
// the offline check runs them on tens of thousands. A violation means the lead
// is thrown away, never shown.
//
// Each rule is stated as "what must be true", named, and testable. Add a rule
// here rather than in a pack when it's a fact about people, not about a service.
// ---------------------------------------------------------------------------

/** What's plausibly in a mouth at a given age. Shared by every pack, so a
 *  denture storyline and a paediatric one can't disagree. */
export const DENTITION_AGE: Record<Dentition, [number, number]> = {
  primary_child: [1, 6],
  mixed_child: [6, 13],
  full_natural: [6, 95],
  some_missing: [12, 95],
  partial_denture: [18, 95],
  full_upper_denture: [35, 95],
  full_dentures: [40, 95],
};

export type RuleContext = {
  /** The service's own hard age bounds for the PATIENT. */
  patientAge: [number, number];
};

type Rule = { id: string; check: (s: LeadSkeleton, ctx: RuleContext) => string | null };

const RULES: Rule[] = [
  {
    id: "R-SERVICE-AGE",
    check: (s, ctx) =>
      s.patient.age < ctx.patientAge[0] || s.patient.age > ctx.patientAge[1]
        ? `patient is ${s.patient.age}, outside this call type's ${ctx.patientAge[0]}–${ctx.patientAge[1]}`
        : null,
  },
  {
    id: "R-NO-MINOR-CALLER",
    check: (s) => (s.caller.age < 18 ? `caller is ${s.caller.age} — a minor is never on the phone` : null),
  },
  {
    id: "R-CHILD-SILENT",
    check: (s) =>
      s.patient.age < 18 && s.patient.speaksOnCall ? "a child patient must never speak on the call" : null,
  },
  {
    id: "R-SELF",
    check: (s) => {
      if (s.caller.role !== "SELF") return null;
      if (s.patient.age < 18) return "a minor can't be calling for themselves";
      return s.caller.age !== s.patient.age ? "caller and patient are the same person but different ages" : null;
    },
  },
  {
    id: "R-PARENT",
    check: (s) => {
      if (s.caller.role !== "PARENT") return null;
      const gap = s.caller.age - s.patient.age;
      if (gap < 18) return `parent is only ${gap} years older than the patient`;
      if (gap > 50) return `parent is ${gap} years older than the patient`;
      return null;
    },
  },
  {
    id: "R-GUARDIAN",
    check: (s) => {
      if (s.caller.role !== "GUARDIAN" && s.caller.role !== "GRANDPARENT") return null;
      const gap = s.caller.age - s.patient.age;
      const min = s.caller.role === "GRANDPARENT" ? 36 : 18;
      return gap < min ? `${s.caller.role.toLowerCase()} is only ${gap} years older than the patient` : null;
    },
  },
  {
    id: "R-ADULT-CHILD",
    check: (s) => {
      if (s.caller.role !== "ADULT_CHILD") return null;
      const gap = s.patient.age - s.caller.age;
      if (gap < 18) return `adult child is only ${gap} years younger than the patient`;
      if (gap > 45) return `adult child is ${gap} years younger than the patient`;
      return s.patient.age < 60 ? `patient is only ${s.patient.age} — too young for an adult child to be calling` : null;
    },
  },
  {
    id: "R-SPOUSE",
    check: (s) => {
      if (s.caller.role !== "SPOUSE") return null;
      if (s.patient.age < 18) return "a spouse can't be calling for a minor";
      const gap = Math.abs(s.caller.age - s.patient.age);
      return gap > 15 ? `spouses are ${gap} years apart` : null;
    },
  },
  {
    id: "R-CAREGIVER",
    check: (s) =>
      s.caller.role === "CAREGIVER" && s.patient.age < 60
        ? `patient is only ${s.patient.age} — too young for a caregiver call`
        : null,
  },
  {
    id: "R-COVERAGE-AGE",
    check: (s) => {
      const a = s.patient.age;
      if ((s.coverage === "MEDICARE_ADVANTAGE" || s.coverage === "MEDICARE_ONLY") && a < 65) {
        return `${s.coverage} at age ${a}`;
      }
      if (s.coverage === "CHIP" && a > 18) return `CHIP at age ${a}`;
      if (s.coverage === "VA" && a < 18) return "VA benefits for a child patient";
      return null;
    },
  },
  {
    id: "R-DENTITION",
    check: (s) => {
      const [lo, hi] = DENTITION_AGE[s.patient.dentition];
      return s.patient.age < lo || s.patient.age > hi
        ? `${s.patient.dentition} at age ${s.patient.age}`
        : null;
    },
  },
  {
    id: "R-VISIT-HISTORY",
    check: (s) =>
      s.yearsSinceLastVisit != null && s.yearsSinceLastVisit > Math.max(0, s.patient.age - 2)
        ? `last visit ${s.yearsSinceLastVisit} years ago but the patient is ${s.patient.age}`
        : null,
  },
  {
    id: "R-NAMES",
    check: (s) =>
      s.caller.role !== "SELF" && s.caller.firstName === s.patient.firstName
        ? "caller and patient share a first name"
        : null,
  },
];

export function checkLead(skeleton: LeadSkeleton, ctx: RuleContext): Violation[] {
  const out: Violation[] = [];
  for (const rule of RULES) {
    const detail = rule.check(skeleton, ctx);
    if (detail) out.push({ rule: rule.id, detail });
  }
  return out;
}

export const RULE_IDS = RULES.map((r) => r.id);
