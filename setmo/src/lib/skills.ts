// The SetMo skill taxonomy. Two tiers:
//  - universal: present in every rubric (transferable across service types)
//  - service_specific: unique to one service's call
// Keys match the prototype's data shapes and the ElevenLabs agent rubric.

export type SkillTierKey = "universal" | "service_specific";

export interface SkillDef {
  key: string;
  name: string;
  tier: SkillTierKey;
}

// Universal skills — every rubric scores these.
export const UNIVERSAL_SKILLS: SkillDef[] = [
  { key: "rapport", name: "Rapport & warmth", tier: "universal" },
  { key: "listening", name: "Listening & empathy", tier: "universal" },
  { key: "objection", name: "Objection handling", tier: "universal" },
  { key: "confidence", name: "Confidence & leadership", tier: "universal" },
  { key: "closing", name: "Closing the appt", tier: "universal" },
];

// Implant/full-arch/denture-specific skills (v1 reference rubric).
export const IMPLANT_SPECIFIC_SKILLS: SkillDef[] = [
  { key: "discovery", name: "Discovery — the 'why'", tier: "service_specific" },
  { key: "painpoint", name: "Pain-point exploration", tier: "service_specific" },
  { key: "value", name: "Value building", tier: "service_specific" },
];

// The 8-skill implant rubric, in display order (matches prototype results screen).
export const IMPLANT_RUBRIC: SkillDef[] = [
  UNIVERSAL_SKILLS[0], // rapport
  UNIVERSAL_SKILLS[1], // listening
  IMPLANT_SPECIFIC_SKILLS[0], // discovery
  IMPLANT_SPECIFIC_SKILLS[1], // painpoint
  UNIVERSAL_SKILLS[2], // objection
  UNIVERSAL_SKILLS[3], // confidence
  IMPLANT_SPECIFIC_SKILLS[2], // value
  UNIVERSAL_SKILLS[4], // closing
];

const ALL_SKILLS: SkillDef[] = [
  ...UNIVERSAL_SKILLS,
  ...IMPLANT_SPECIFIC_SKILLS,
];

const SKILL_BY_KEY = new Map(ALL_SKILLS.map((s) => [s.key, s]));

export function skillName(key: string): string {
  return SKILL_BY_KEY.get(key)?.name ?? key;
}

export function skillTier(key: string): SkillTierKey {
  return SKILL_BY_KEY.get(key)?.tier ?? "universal";
}

// The ordered rubric for a given service type. v1 only ships implant/denture.
export function rubricFor(serviceType: string): SkillDef[] {
  switch (serviceType) {
    case "IMPLANT":
    case "DENTURE":
      return IMPLANT_RUBRIC;
    default:
      return IMPLANT_RUBRIC;
  }
}

// Maps an ElevenLabs agent evaluation-criteria/category key to a skill key.
// Default: identity (the agent emits our skill keys). Override per service as
// the agents are finalized (the spec's RubricMapping concept).
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
  return CATEGORY_TO_SKILL[norm] ?? (SKILL_BY_KEY.has(norm) ? norm : null);
}
