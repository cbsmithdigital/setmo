/**
 * packs:check — the offline gate every service pack must pass.
 *
 * Generates tens of thousands of leads per pack and asserts that not one breaks
 * a rule, then feeds it deliberately broken leads to prove the rules actually
 * fire. Costs nothing (no model calls) and runs in seconds, so it can gate the
 * build. If this passes, "braces for a 4-year-old" is not reachable.
 *
 * Beyond the rules on the facts, it checks what a setter now SEES before the
 * call (the lead card) against the person who answers: coverage vs. situation
 * and hesitation, lead source vs. hesitation and timing, names vs. ages, the
 * challenge level a lead actually plays at, and every "pick your lead" option
 * the practice page offers — for the implant generator too.
 *
 * Run: pnpm packs:check
 */
// The implant generator is checked offline: without a key it never calls a model.
delete process.env.ANTHROPIC_API_KEY;

import { PACKS_WITH_PERSONA } from "../src/lib/packs/registry";
import { sampleLead, nearestLevel, fitsPlan, situationText, situationCoverage, type Archetype, type PersonaSpec } from "../src/lib/realism/sampler";
import { checkLead, RULE_IDS } from "../src/lib/realism/rules";
import { voiceGaps } from "../src/lib/realism/voices";
import { VOICE_CATALOG, voiceSuits } from "../src/lib/voices";
import { nameFitsAge } from "../src/lib/realism/names";
import { LEAD_SOURCES, maxAttemptsFor, noteGivesConcernAway } from "../src/lib/realism/lead-card";
import { templateProse } from "../src/lib/realism/compose";
import { leadChoiceOptions, validateLeadChoice } from "../src/lib/lead-choice";
import { generatePersona, IMPLANT_AGES, IMPLANT_CONCERNS } from "../src/lib/personas";
import type { CallerRole, LeadChoice, LeadSkeleton } from "../src/lib/realism/types";

const N = Number(process.env.PACKS_CHECK_N ?? 20000);
const LEVELS = ["ADAPTIVE", "WARM", "TOUGH"] as const;

type Fail = { pack: string; seed: string; rule: string; detail: string };

/** The voice is the caller's: in the roster, their gender, suited to their age. */
function voiceProblem(voice: { id: string; name: string }, gender: "male" | "female", age: number): string | null {
  const v = VOICE_CATALOG.find((x) => x.id === voice.id);
  if (!v) return `voice ${voice.name} (${voice.id}) isn't in the roster`;
  if (!voiceSuits(v, gender, age)) return `${v.name} (${v.gender}, ${v.ages}) for a ${age}-year-old ${gender} caller`;
  return null;
}

/** Everything about a lead that the rules on facts don't cover. */
function consistency(spec: PersonaSpec, lead: LeadSkeleton, opts: { difficulty?: (typeof LEVELS)[number]; choice?: LeadChoice; callAbout: string }): { rule: string; detail: string }[] {
  const out: { rule: string; detail: string }[] = [];
  const archetype = spec.archetypes.find((a) => a.key === lead.archetype) as Archetype;
  const objection = archetype.objections.find((o) => o.text === lead.objection);
  if (!objection) return [{ rule: "OBJECTION", detail: `"${lead.objection}" isn't one of ${archetype.key}'s` }];

  if (!lead.card) out.push({ rule: "CARD", detail: "lead has no lead card" });
  if (!fitsPlan(objection.coverage, lead.coverage)) out.push({ rule: "OBJECTION-COVERAGE", detail: `"${lead.objection}" with ${lead.coverage}` });
  const situation = archetype.situations.find((s) => situationText(s) === lead.situation);
  if (situation && !fitsPlan(situationCoverage(situation), lead.coverage)) {
    out.push({ rule: "SITUATION-COVERAGE", detail: `"${lead.situation}" with ${lead.coverage}` });
  }
  if (lead.card && objection.notSources?.includes(lead.card.source)) {
    out.push({ rule: "OBJECTION-SOURCE", detail: `"${lead.objection}" after "${lead.card.source}"` });
  }
  const voice = voiceProblem(lead.voice, lead.caller.gender, lead.caller.age);
  if (voice) out.push({ rule: "VOICE", detail: voice });
  if (!nameFitsAge(lead.caller.firstName, lead.caller.age)) out.push({ rule: "NAME-AGE", detail: `${lead.caller.firstName}, ${lead.caller.age}` });
  if (!nameFitsAge(lead.patient.firstName, lead.patient.age)) out.push({ rule: "NAME-AGE", detail: `${lead.patient.firstName}, ${lead.patient.age}` });

  // The challenge level: the hesitation comes from the requested level whenever
  // this storyline (and the picked concern) has one there.
  if (opts.difficulty && opts.difficulty !== "ADAPTIVE") {
    const base = opts.choice?.concern ? archetype.objections.filter((o) => o.concern === opts.choice!.concern) : archetype.objections;
    const want = nearestLevel(base, opts.difficulty)[0]?.difficulty;
    if (want && objection.difficulty !== want) {
      out.push({ rule: "LEVEL", detail: `${opts.difficulty} lead got a ${objection.difficulty} hesitation in ${archetype.key} (${want} exists)` });
    }
  }

  // The plain note that stands in when a written one gives something away must
  // itself give nothing away.
  const plain = templateProse(lead, opts.callAbout).formNote ?? "";
  const leak = noteGivesConcernAway(plain, lead.concern);
  if (leak) out.push({ rule: "PLAIN-NOTE", detail: leak });
  return out;
}

async function run(): Promise<number> {
  const failures: Fail[] = [];
  let generated = 0;
  const packs = PACKS_WITH_PERSONA();
  if (!packs.length) {
    console.log("No packs with a lead generator yet — nothing to check.");
    return 0;
  }

  for (const pack of packs) {
    const spec = pack.persona!;
    const ctx = { patientAge: spec.patientAge };
    const callAbout = pack.callAbout ?? pack.name.toLowerCase();
    const seenArchetypes = new Set<string>();
    const seenRoles = new Set<string>();
    const seenCoverage = new Set<string>();
    let youngCallers = 0;
    let youngVoices = 0;

    const check = (lead: LeadSkeleton, seed: string, difficulty?: (typeof LEVELS)[number], choice?: LeadChoice) => {
      generated++;
      for (const v of checkLead(lead, ctx)) failures.push({ pack: pack.service, seed, ...v });
      for (const v of consistency(spec, lead, { difficulty, choice, callAbout })) failures.push({ pack: pack.service, seed, ...v });
    };

    // Surprise leads, at every challenge level.
    for (const difficulty of LEVELS) {
      const n = difficulty === "ADAPTIVE" ? N : Math.ceil(N / 4);
      for (let i = 0; i < n; i++) {
        const seed = `${pack.service}:${difficulty}:${i}`;
        const lead = sampleLead(spec, seed, { difficulty });
        if (difficulty === "ADAPTIVE") {
          seenArchetypes.add(lead.archetype);
          seenRoles.add(lead.caller.role);
          seenCoverage.add(lead.coverage);
          if (lead.caller.age <= 35) {
            youngCallers++;
            if (VOICE_CATALOG.find((v) => v.id === lead.voice.id)?.ages === "young") youngVoices++;
          }
        }
        check(lead, seed, difficulty);
      }
    }

    // "Pick your lead": every combination the practice page offers, at every
    // level, must be honored exactly and still produce only possible leads.
    const options = leadChoiceOptions(pack.service);
    if (options) {
      const callers: (CallerRole | undefined)[] = [undefined, ...(options.callers ?? []).map((c) => c.key as CallerRole)];
      let combos = 0;
      for (const caller of callers) {
        const concerns = [undefined, ...(caller ? options.concernsByCaller?.[caller] ?? [] : options.concerns.map((c) => c.key))];
        for (const concern of concerns) {
          for (const gender of [undefined, "male", "female"] as const) {
            const choice: LeadChoice = { ...(caller ? { caller } : {}), ...(concern ? { concern } : {}), ...(gender ? { gender } : {}) };
            if (Object.keys(choice).length && !validateLeadChoice(pack.service, choice)) {
              failures.push({ pack: pack.service, seed: JSON.stringify(choice), rule: "PICK-VALID", detail: "an offered choice was refused" });
            }
            for (const difficulty of LEVELS) {
              combos++;
              for (let i = 0; i < Math.ceil(N / 200); i++) {
                const seed = `${pack.service}:pick:${caller}:${concern}:${gender}:${difficulty}:${i}`;
                const lead = sampleLead(spec, seed, { choice, difficulty });
                check(lead, seed, difficulty, choice);
                const off =
                  (caller && lead.caller.role !== caller) ||
                  (gender && lead.caller.gender !== gender) ||
                  (concern && lead.concern !== concern);
                if (off) failures.push({ pack: pack.service, seed, rule: "PICK", detail: `asked for ${JSON.stringify(choice)}, got ${lead.caller.role}/${lead.caller.gender}/${lead.concern}` });
              }
            }
          }
        }
      }
      // And the ones it greys out must be refused by the server too.
      for (const caller of options.callers ?? []) {
        for (const c of options.concerns) {
          if (options.concernsByCaller?.[caller.key]?.includes(c.key)) continue;
          let refused = false;
          try {
            validateLeadChoice(pack.service, { caller: caller.key, concern: c.key });
          } catch {
            refused = true;
          }
          if (!refused) failures.push({ pack: pack.service, seed: `${caller.key}+${c.key}`, rule: "PICK-VALID", detail: "a greyed-out combination was accepted" });
        }
      }
      console.log(`  pick your lead: ${combos} combinations × levels checked`);
    }

    const unusedArchetypes = spec.archetypes.filter((a) => !seenArchetypes.has(a.key)).map((a) => a.key);
    const young = youngCallers ? `${Math.round((youngVoices / youngCallers) * 100)}% of callers 35 or under on a young voice` : "no callers 35 or under";
    console.log(
      `${pack.service} (${pack.name}): ${N} leads · ${seenArchetypes.size}/${spec.archetypes.length} storylines · ` +
        `callers ${[...seenRoles].join(",")} · ${seenCoverage.size} coverage types · ${young}`
    );
    if (unusedArchetypes.length) {
      console.log(`  ⚠ storylines never sampled: ${unusedArchetypes.join(", ")}`);
    }
  }

  // The implant generator (its own path): every pick it offers, checked on the
  // parts code decides — gender, exact age in the band, the hesitation, a name
  // that fits the age, and a lead card that holds together.
  {
    const options = leadChoiceOptions("IMPLANT")!;
    let combos = 0;
    for (const gender of [undefined, "male", "female"] as const) {
      for (const age of [undefined, ...IMPLANT_AGES.map((a) => a.key)]) {
        const allowed = age ? options.concernsByAge?.[age] ?? [] : IMPLANT_CONCERNS.map((c) => c.key);
        for (const concern of [undefined, ...allowed]) {
          const choice: LeadChoice = { ...(gender ? { gender } : {}), ...(age ? { age } : {}), ...(concern ? { concern } : {}) };
          combos++;
          for (let i = 0; i < 6; i++) {
            const p = await generatePersona("ADAPTIVE", { choice, card: true });
            generated++;
            const seed = `IMPLANT:${JSON.stringify(choice)}:${i}`;
            const fail = (rule: string, detail: string) => failures.push({ pack: "IMPLANT", seed, rule, detail });
            const n = Number(p.age);
            if (!/^\d+$/.test(p.age)) fail("AGE", `age "${p.age}" isn't a number`);
            if (gender && p.gender !== gender) fail("PICK", `asked for ${gender}, got ${p.gender}`);
            const band = IMPLANT_AGES.find((a) => a.key === age);
            if (band) {
              const ok = (band.key === "40s-50s" && n >= 46 && n <= 59) || (band.key === "60s" && n >= 60 && n <= 67) || (band.key === "70s" && n >= 70);
              if (!ok) fail("PICK", `asked for ${band.key}, got ${n}`);
            }
            if (concern && p.primaryObjection !== IMPLANT_CONCERNS.find((c) => c.key === concern)!.objection) fail("PICK", `asked for ${concern}, got "${p.primaryObjection}"`);
            if (!nameFitsAge(p.name.split(" ")[0], n)) fail("NAME-AGE", `${p.name}, ${n}`);
            const voice = voiceProblem(p.voice, p.gender, n);
            if (voice) fail("VOICE", voice);
            if (!p.card) fail("CARD", "no lead card");
            else {
              if (p.card.attempts > maxAttemptsFor(p.card.optedIn)) fail("R-CARD-TIMING", `${p.card.attempts} missed calls, came in ${p.card.optedIn}`);
              const allowedTimes = LEAD_SOURCES[p.card.source]?.optIn;
              if (allowedTimes && !allowedTimes.includes(p.card.optedIn)) fail("R-CARD-TIMING", `${p.card.source} at ${p.card.optedIn}`);
            }
            const key = IMPLANT_CONCERNS.find((c) => c.objection === p.primaryObjection)?.key;
            const leak = noteGivesConcernAway(p.formNote, key);
            if (leak) fail("PLAIN-NOTE", leak);
          }
        }
      }
    }
    // Greyed-out implant picks are refused.
    for (const a of IMPLANT_AGES) {
      for (const c of a.excludes ?? []) {
        let refused = false;
        try {
          validateLeadChoice("IMPLANT", { age: a.key, concern: c });
        } catch {
          refused = true;
        }
        if (!refused) failures.push({ pack: "IMPLANT", seed: `${a.key}+${c}`, rule: "PICK-VALID", detail: "a greyed-out combination was accepted" });
      }
    }
    console.log(`IMPLANT: ${combos} pick combinations checked (offline generator)`);
  }

  // Negative goldens: each must be REJECTED by the named rule. This is what
  // stops a rule from being quietly deleted or weakened later.
  const base = sampleLead(PACKS_WITH_PERSONA()[0].persona!, "negative-base");
  const ctx = { patientAge: PACKS_WITH_PERSONA()[0].persona!.patientAge };
  const negatives: { name: string; rule: string; lead: LeadSkeleton }[] = [
    {
      name: "braces for a 4-year-old (patient below the service's range)",
      rule: "R-SERVICE-AGE",
      lead: { ...base, patient: { ...base.patient, age: 1, dentition: "primary_child" } },
    },
    {
      name: "a 9-year-old calling for themselves",
      rule: "R-NO-MINOR-CALLER",
      lead: { ...base, caller: { ...base.caller, age: 9, role: "SELF" }, patient: { ...base.patient, age: 9 } },
    },
    {
      name: "a child speaking on the call",
      rule: "R-CHILD-SILENT",
      lead: {
        ...base,
        caller: { ...base.caller, role: "PARENT", age: 38 },
        patient: { ...base.patient, age: 8, dentition: "mixed_child", speaksOnCall: true },
      },
    },
    {
      name: "a parent only 10 years older than their child",
      rule: "R-PARENT",
      lead: {
        ...base,
        caller: { ...base.caller, role: "PARENT", age: 18 },
        patient: { ...base.patient, age: 8, dentition: "mixed_child", speaksOnCall: false },
      },
    },
    {
      name: "an adult child calling for a 40-year-old",
      rule: "R-ADULT-CHILD",
      lead: {
        ...base,
        caller: { ...base.caller, role: "ADULT_CHILD", age: 20 },
        patient: { ...base.patient, age: 40, speaksOnCall: false },
      },
    },
    {
      name: "Medicare for a 30-year-old",
      rule: "R-COVERAGE-AGE",
      lead: { ...base, coverage: "MEDICARE_ADVANTAGE", patient: { ...base.patient, age: 30 } },
    },
    {
      name: "CHIP for a 40-year-old",
      rule: "R-COVERAGE-AGE",
      lead: { ...base, coverage: "CHIP", patient: { ...base.patient, age: 40 } },
    },
    {
      name: "full dentures at 22",
      rule: "R-DENTITION",
      lead: { ...base, patient: { ...base.patient, age: 22, dentition: "full_dentures" } },
    },
    {
      name: "baby teeth at 30",
      rule: "R-DENTITION",
      lead: { ...base, patient: { ...base.patient, age: 30, dentition: "primary_child" } },
    },
    {
      name: "last visit 20 years ago at age 9",
      rule: "R-VISIT-HISTORY",
      lead: {
        ...base,
        caller: { ...base.caller, role: "PARENT", age: 35 },
        patient: { ...base.patient, age: 9, dentition: "mixed_child", speaksOnCall: false },
        yearsSinceLastVisit: 20,
      },
    },
    {
      name: "two missed calls on a lead that came in ten minutes ago",
      rule: "R-CARD-TIMING",
      lead: { ...base, card: { source: "google_form", optedIn: "about 10 minutes ago", attempts: 2 } },
    },
    {
      name: "an after-hours voicemail left ten minutes ago",
      rule: "R-CARD-TIMING",
      lead: { ...base, card: { source: "voicemail", optedIn: "about 10 minutes ago", attempts: 0 } },
    },
    {
      name: "found through an insurer's dentist list, with no insurance",
      rule: "R-CARD-SOURCE",
      lead: { ...base, coverage: "UNINSURED", card: { source: "insurance_voicemail", optedIn: "last night", attempts: 1 } },
    },
  ];

  for (const n of negatives) {
    const found = checkLead(n.lead, ctx).some((v) => v.rule === n.rule);
    if (!found) {
      failures.push({ pack: "negative", seed: n.name, rule: n.rule, detail: "was NOT rejected — the rule is not working" });
    }
  }

  // Every rule must be exercised by at least one negative golden, so a rule
  // can't rot untested.
  const covered = new Set(negatives.map((n) => n.rule));
  const untested = RULE_IDS.filter((r) => !covered.has(r) && r !== "R-SELF" && r !== "R-GUARDIAN" && r !== "R-SPOUSE" && r !== "R-CAREGIVER" && r !== "R-NAMES");
  for (const rule of untested) {
    failures.push({ pack: "coverage", seed: "-", rule, detail: "no negative golden exercises this rule" });
  }

  // The voice check itself catches the wrong age and the wrong gender.
  const youngWoman = VOICE_CATALOG.find((v) => v.gender === "female" && v.ages === "young");
  if (youngWoman && !voiceProblem(youngWoman, "female", 70)) {
    failures.push({ pack: "voices", seed: youngWoman.name, rule: "VOICE", detail: "a young voice on a 70-year-old caller wasn't caught" });
  }
  if (youngWoman && !voiceProblem(youngWoman, "male", 25)) {
    failures.push({ pack: "voices", seed: youngWoman.name, rule: "VOICE", detail: "a woman's voice on a man wasn't caught" });
  }

  const gaps = voiceGaps();
  if (gaps.length) {
    console.log(`\nVoice roster: no voice suits callers ${gaps.join(", ")} — they borrow another adult voice of their gender until one is added.`);
  }

  console.log(`\n${generated.toLocaleString()} leads generated, ${negatives.length} negative goldens.`);
  if (failures.length) {
    const byRule = new Map<string, number>();
    for (const f of failures) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
    console.error(`\n✗ ${failures.length} failure(s): ${[...byRule].map(([r, n]) => `${r}×${n}`).join(", ")}`);
    for (const f of failures.slice(0, 25)) console.error(`  [${f.pack} ${f.seed}] ${f.rule}: ${f.detail}`);
    return 1;
  }
  console.log("✓ no impossible leads, every pick is honored, and every rule fires when it should.");
  return 0;
}

run().then((code) => process.exit(code));
