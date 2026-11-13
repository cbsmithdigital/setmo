import { test } from "node:test";
import assert from "node:assert/strict";
import { goodCallSection } from "@/lib/scorer";
import { IMPLANT_RUBRIC_V1 } from "@/lib/packs/implant";
import { GENERAL_NP_RUBRIC_V1 } from "@/lib/packs/general-new-patient";
import { WISDOM_RUBRIC_V1 } from "@/lib/packs/wisdom";
import { ORTHO_RUBRIC_V1 } from "@/lib/packs/ortho";
import { COSMETIC_RUBRIC_V1 } from "@/lib/packs/cosmetic";
import { DENTURE_RUBRIC_V1 } from "@/lib/packs/denture";

// What a strong call looks like, per call type (Adam, 2026-11-13): dentures dig
// like full-arch implants; new-patient and hygiene calls can be very short.
const EXPECTED = [
  { rubric: GENERAL_NP_RUBRIC_V1, depth: "light", minutes: [2, 5] },
  { rubric: WISDOM_RUBRIC_V1, depth: "light", minutes: [3, 5] },
  { rubric: ORTHO_RUBRIC_V1, depth: "light", minutes: [3, 5] },
  { rubric: COSMETIC_RUBRIC_V1, depth: "medium", minutes: [4, 6] },
  { rubric: DENTURE_RUBRIC_V1, depth: "deep", minutes: [6, 10] },
] as const;

test("the implant rubric has no profile, so its scoring request is unchanged", () => {
  assert.equal(IMPLANT_RUBRIC_V1.goodCall, undefined);
  assert.equal(goodCallSection(IMPLANT_RUBRIC_V1.goodCall), "");
});

test("every other call type has the agreed depth and length", () => {
  for (const { rubric, depth, minutes } of EXPECTED) {
    const p = rubric.goodCall;
    assert.ok(p, `${rubric.id} has a profile`);
    assert.equal(p.depth, depth, `${rubric.id} depth`);
    assert.deepEqual(p.minutes, minutes, `${rubric.id} minutes`);
    assert.ok(p.mustHaves.length >= 4, `${rubric.id} lists what a strong call covers`);
    assert.match(p.mustHaves.at(-1) ?? "", /specific day and time/, `${rubric.id} ends at booking a time`);
  }
});

test("rubric ids are unchanged, so stored and partner-facing data keep their meaning", () => {
  assert.deepEqual(
    EXPECTED.map((e) => e.rubric.id),
    ["general_np.v1", "wisdom.v1", "ortho.v1", "cosmetic.v1", "denture.v1"],
  );
});

test("the scoring section carries the profile and the grading rules", () => {
  for (const { rubric } of EXPECTED) {
    const p = rubric.goodCall!;
    const s = goodCallSection(p);
    assert.ok(s.includes(`What a strong ${p.label} call looks like`));
    assert.ok(s.includes(`about ${p.minutes[0]} to ${p.minutes[1]} minutes`));
    for (const m of p.mustHaves) assert.ok(s.includes(m), `${rubric.id}: ${m}`);
    for (const n of p.notNeeded ?? []) assert.ok(s.includes(n), `${rubric.id}: ${n}`);
    assert.match(s, /overall 4\.0 or higher however short it was/);
    assert.match(s, /Never lower a skill score, or list a miss, for depth this call type doesn't need/);
    // The profile must never make "booked" (appointment_set to partners) stricter.
    assert.match(s, /Judge booked exactly as its definition below says, no more strictly\./);
  }
});

test("profile wording has no em dashes", () => {
  for (const { rubric } of EXPECTED) {
    const p = rubric.goodCall!;
    const text = [p.label, ...p.mustHaves, ...(p.niceToHave ?? []), ...(p.notNeeded ?? [])].join(" ");
    assert.ok(!text.includes("—"), `${rubric.id} has an em dash`);
  }
});
