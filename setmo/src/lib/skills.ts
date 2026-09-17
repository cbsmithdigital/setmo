import { rubricForService, rubricById, skillDef } from "@/lib/packs/registry";
import { IMPLANT_RUBRIC_V1 } from "@/lib/packs/implant";
import type { RubricSkill, SkillTierKey } from "@/lib/packs/types";

// The SetMo skill taxonomy. Two tiers:
//  - universal: present in every rubric (transferable across service types)
//  - service_specific: unique to one service's call
// The definitions live in the service packs (src/lib/packs) — this file is the
// app-facing lookup, so callers don't care which service a skill came from.

export type { SkillTierKey };
export type SkillDef = RubricSkill;

/** The 8-skill implant rubric, in display order. */
export const IMPLANT_RUBRIC: SkillDef[] = IMPLANT_RUBRIC_V1.skills;

export const UNIVERSAL_SKILLS: SkillDef[] = IMPLANT_RUBRIC.filter((s) => s.tier === "universal");
export const IMPLANT_SPECIFIC_SKILLS: SkillDef[] = IMPLANT_RUBRIC.filter((s) => s.tier === "service_specific");

export function skillName(key: string): string {
  return skillDef(key)?.name ?? key;
}

export function skillTier(key: string): SkillTierKey {
  return skillDef(key)?.tier ?? "universal";
}

/** Compact label for dense grids (the setter×skill heatmap headers). */
export function skillShort(key: string): string {
  return skillDef(key)?.short ?? skillName(key);
}

/** The ordered rubric for a given service type — what a NEW call is graded on. */
export function rubricFor(serviceType: string): SkillDef[] {
  return rubricForService(serviceType).skills;
}

/** The ordered rubric a SCORED call was graded on. Readers that render stored
 *  skills should use this, so a call keeps rendering the way it was graded. */
export function rubricForEvaluation(rubricId: string | null | undefined): SkillDef[] {
  return rubricById(rubricId).skills;
}

// Maps an ElevenLabs agent evaluation-criteria/category key to a skill key.
// Default: identity (the agent emits our skill keys). Only the implant agent
// emits these — other services are scored from the transcript only.
const CATEGORY_TO_SKILL: Record<string, string> = {
  rapport: "rapport",
  rapport_warmth: "rapport",
  listening: "listening",
  listening_empathy: "listening",
  discovery: "discovery",
  painpoint: "painpoint",
  pain_point_exploration: "painpoint",
  objection: "objection",
  objection_handling: "objection",
  confidence: "confidence",
  confidence_leadership: "confidence",
  value: "value",
  value_building: "value",
  closing: "closing",
};

export function categoryToSkillKey(category: string): string | null {
  const norm = category.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CATEGORY_TO_SKILL[norm] ?? (skillDef(norm) ? norm : null);
}
