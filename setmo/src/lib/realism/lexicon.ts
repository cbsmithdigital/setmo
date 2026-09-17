import type { LeadSkeleton, Violation } from "@/lib/realism/types";

// ---------------------------------------------------------------------------
// Checks on the WORDS, after the model has written the lead.
//
// The sampler guarantees the facts; this guarantees the prose didn't invent new
// ones. A lead that fails is rewritten once, then replaced with a safe template
// — a setter never meets an unchecked lead.
// ---------------------------------------------------------------------------

/** Wording that belongs to the implant call and nowhere else. A denture or
 *  new-patient lead that starts talking about All-on-4 is the old bug — one
 *  service's content leaking into another — in a new form. */
const IMPLANT_WORDING = /\b(all[-\s]?on[-\s]?(4|6|x)|3d (cone beam|scan)|full[-\s]arch|implant[- ]?retained)\b/i;

/** Named products and chains a lead shouldn't invent; the practice's own facts
 *  are the only brands a call should contain. */
const BRANDS = /\b(smiledirectclub|smile ?direct|byte aligners|aspen dental|clearchoice|western dental)\b/i;

/** An invented clinician. The practice's real doctors come from its own setup. */
const INVENTED_DOCTOR = /\bdr\.?\s+[A-Z][a-z]+/;

export type LexiconOpts = {
  /** True for the implant pack only. */
  allowImplantWording?: boolean;
  /** Doctor names the practice actually has. */
  knownDoctors?: string[];
  /** Extra patterns a pack wants banned. */
  banned?: { id: string; pattern: RegExp; detail: string }[];
};

export function checkProse(text: string, skeleton: LeadSkeleton, opts: LexiconOpts = {}): Violation[] {
  const out: Violation[] = [];
  const add = (rule: string, detail: string) => out.push({ rule, detail });

  if (!opts.allowImplantWording && IMPLANT_WORDING.test(text)) {
    add("LX-IMPLANT-LEAK", "implant wording appeared in a non-implant lead");
  }
  if (BRANDS.test(text)) add("LX-BRAND", "named an outside brand or chain");

  const doctor = text.match(INVENTED_DOCTOR);
  if (doctor && !(opts.knownDoctors ?? []).some((d) => text.includes(d))) {
    add("LX-DOCTOR", `invented a clinician (${doctor[0]})`);
  }

  // The patient's age must not drift in the prose.
  const ageClaim = text.match(/\b(\d{1,2})[- ]year[- ]old\b/);
  if (ageClaim) {
    const claimed = Number(ageClaim[1]);
    if (Math.abs(claimed - skeleton.patient.age) > 1 && Math.abs(claimed - skeleton.caller.age) > 1) {
      add("LX-AGE-DRIFT", `prose says ${claimed}, patient is ${skeleton.patient.age}`);
    }
  }

  // Coverage must not drift either — "Medicare covers it" from someone on a PPO
  // is the kind of detail a setter would answer wrongly.
  if (/\bmedicare\b/i.test(text) && skeleton.coverage !== "MEDICARE_ADVANTAGE" && skeleton.coverage !== "MEDICARE_ONLY") {
    add("LX-COVERAGE-DRIFT", "mentions Medicare but isn't on Medicare");
  }
  if (/\bmedicaid\b/i.test(text) && skeleton.coverage !== "MEDICAID" && skeleton.coverage !== "CHIP") {
    add("LX-COVERAGE-DRIFT", "mentions Medicaid but isn't on it");
  }

  // A child patient must never be the one talking.
  if (skeleton.patient.age < 18 && !skeleton.patient.speaksOnCall && /\bI'?m (in )?(kindergarten|first|second|third|fourth|fifth|sixth|seventh|eighth) grade\b/i.test(text)) {
    add("LX-CHILD-ON-PHONE", "the child appears to be speaking");
  }

  for (const b of opts.banned ?? []) {
    if (b.pattern.test(text)) add(b.id, b.detail);
  }
  return out;
}
