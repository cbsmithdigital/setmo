import { test } from "node:test";
import assert from "node:assert/strict";
import { reasonDepthFor, sampleLead } from "@/lib/realism/sampler";
import { templateProse } from "@/lib/realism/compose";
import { buildLeadPromptV2 } from "@/lib/realism/prompt";
import { GENERAL_NP_PERSONA } from "@/lib/packs/general-new-patient";
import { WISDOM_PERSONA } from "@/lib/packs/wisdom";
import { ORTHO_PERSONA } from "@/lib/packs/ortho";
import { COSMETIC_PERSONA } from "@/lib/packs/cosmetic";
import { DENTURE_PERSONA } from "@/lib/packs/denture";
import type { Difficulty } from "@/lib/personas";

// How readily each kind of lead shares their real reason (Adam, 2026-11-13):
// implants and dentures dig; veneers and some ortho are easier to get to; the
// routine calls have nothing to dig out.
test("each call type's leads share their reason as agreed", () => {
  for (const a of GENERAL_NP_PERSONA.archetypes) assert.equal(reasonDepthFor(GENERAL_NP_PERSONA, a.key), "open", a.key);
  for (const a of WISDOM_PERSONA.archetypes) assert.equal(reasonDepthFor(WISDOM_PERSONA, a.key), "open", a.key);
  for (const a of COSMETIC_PERSONA.archetypes) assert.equal(reasonDepthFor(COSMETIC_PERSONA, a.key), "reachable", a.key);
  for (const a of DENTURE_PERSONA.archetypes) assert.equal(reasonDepthFor(DENTURE_PERSONA, a.key), "hidden", a.key);
  const ortho = Object.fromEntries(ORTHO_PERSONA.archetypes.map((a) => [a.key, reasonDepthFor(ORTHO_PERSONA, a.key)]));
  assert.deepEqual(ortho, {
    child_first_check: "open",
    teen_braces: "open",
    adult_aligners: "reachable",
    shifted_after_braces: "reachable",
    using_ortho_benefit: "open",
    bite_problem: "open",
  });
});

test("no persona spec, or an unknown storyline, falls back sensibly", () => {
  assert.equal(reasonDepthFor(undefined, "anything"), "hidden");
  assert.equal(reasonDepthFor(ORTHO_PERSONA, "not_a_storyline"), "open");
});

const lead = (difficulty: Difficulty) => {
  const skeleton = sampleLead(GENERAL_NP_PERSONA, "reason-depth-test", { difficulty });
  const prose = templateProse(skeleton, "becoming a new patient at the practice");
  const base = { skeleton, prose, callAbout: "becoming a new patient at the practice", office: { name: "Test Dental" }, difficulty };
  return {
    prompt: (extra: Partial<Parameters<typeof buildLeadPromptV2>[0]> = {}) => buildLeadPromptV2({ ...base, ...extra }).systemPrompt,
    prose,
  };
};

test("hidden is the original prompt word for word, with no length line", () => {
  for (const d of ["WARM", "ADAPTIVE", "TOUGH"] as const) {
    const { prompt, prose } = lead(d);
    const original = prompt();
    assert.equal(prompt({ reasonDepth: "hidden", typicalMinutes: [6, 10] }), original);
    assert.ok(original.includes(`WHAT YOU DON'T VOLUNTEER\n- The real reason underneath: "${prose.hiddenWhyInTheirWords}". Don't offer this.`));
    assert.ok(!original.includes("A call like this usually takes"));
  }
  assert.match(lead("TOUGH").prompt(), /keep your real reason hidden unless they ask well/);
});

test("reachable: shared after a genuine why-now question; Tough wants a follow-up", () => {
  const warm = lead("WARM").prompt({ reasonDepth: "reachable", typicalMinutes: [4, 6] });
  assert.ok(warm.includes("WHAT'S UNDERNEATH"));
  assert.ok(!warm.includes("Don't offer this."));
  assert.match(warm, /share your real reason as soon as they ask about it/);
  assert.match(warm, /usually takes about 4 to 6 minutes/);
  const tough = lead("TOUGH").prompt({ reasonDepth: "reachable", typicalMinutes: [4, 6] });
  assert.match(tough, /share your real reason only once they've asked about it and followed up/);
  assert.ok(!tough.includes("keep your real reason hidden"));
});

test("open: no secret, and Tough is guarded about committing, not about why they called", () => {
  const open = lead("TOUGH").prompt({ reasonDepth: "open", typicalMinutes: [2, 5] });
  assert.ok(open.includes("WHAT'S ON YOUR MIND"));
  assert.ok(open.includes("This isn't a secret."));
  assert.match(open, /guarded about committing, not about why you called/);
  assert.ok(!open.includes("keep your real reason hidden"));
  assert.match(open, /usually takes about 2 to 5 minutes/);
  // The hesitation is still there to be handled, at every level.
  assert.match(open, /- Your hesitation: ".+"\. Raise it naturally/);
});
