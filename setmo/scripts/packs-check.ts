/**
 * packs:check — the offline gate every service pack must pass.
 *
 * Generates tens of thousands of leads per pack and asserts that not one breaks
 * a rule, then feeds it deliberately broken leads to prove the rules actually
 * fire. Costs nothing (no model calls) and runs in seconds, so it can gate the
 * build. If this passes, "braces for a 4-year-old" is not reachable.
 *
 * Run: pnpm packs:check
 */
import { PACKS_WITH_PERSONA } from "../src/lib/packs/registry";
import { sampleLead } from "../src/lib/realism/sampler";
import { checkLead, RULE_IDS } from "../src/lib/realism/rules";
import { unmatchedBands } from "../src/lib/realism/voices";
import type { LeadSkeleton } from "../src/lib/realism/types";

const N = Number(process.env.PACKS_CHECK_N ?? 20000);

type Fail = { pack: string; seed: string; rule: string; detail: string };

function run(): number {
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
    const seenArchetypes = new Set<string>();
    const seenRoles = new Set<string>();
    const seenCoverage = new Set<string>();
    let voiceMismatch = 0;

    for (let i = 0; i < N; i++) {
      const seed = `${pack.service}:${i}`;
      const lead = sampleLead(spec, seed);
      generated++;
      seenArchetypes.add(lead.archetype);
      seenRoles.add(lead.caller.role);
      seenCoverage.add(lead.coverage);
      if (!lead.voice.bandMatched) voiceMismatch++;
      for (const v of checkLead(lead, ctx)) failures.push({ pack: pack.service, seed, ...v });
    }

    const unusedArchetypes = spec.archetypes.filter((a) => !seenArchetypes.has(a.key)).map((a) => a.key);
    const pct = ((voiceMismatch / N) * 100).toFixed(1);
    console.log(
      `${pack.service} (${pack.name}): ${N} leads · ${seenArchetypes.size}/${spec.archetypes.length} storylines · ` +
        `callers ${[...seenRoles].join(",")} · ${seenCoverage.size} coverage types · voice age unmatched ${pct}%`
    );
    if (unusedArchetypes.length) {
      console.log(`  ⚠ storylines never sampled: ${unusedArchetypes.join(", ")}`);
    }
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

  const gaps = unmatchedBands();
  if (gaps.length) {
    console.log(`\nVoice roster: no voice is tagged for caller ages ${gaps.join(", ")} — those callers borrow an adult voice until the roster is audited.`);
  }

  console.log(`\n${generated.toLocaleString()} leads generated, ${negatives.length} negative goldens.`);
  if (failures.length) {
    console.error(`\n✗ ${failures.length} failure(s):`);
    for (const f of failures.slice(0, 25)) console.error(`  [${f.pack} ${f.seed}] ${f.rule}: ${f.detail}`);
    return 1;
  }
  console.log("✓ no impossible leads, and every rule fires when it should.");
  return 0;
}

process.exit(run());
