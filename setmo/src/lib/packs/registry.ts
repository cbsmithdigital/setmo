import type { ServiceKey } from "@/generated/prisma/client";
import type { Rubric, RubricSkill, ServicePack } from "@/lib/packs/types";
import { IMPLANT_PACK, IMPLANT_RUBRIC_V1 } from "@/lib/packs/implant";
import { GENERAL_NEW_PATIENT_PACK, GENERAL_NP_RUBRIC_V1 } from "@/lib/packs/general-new-patient";

// The service catalog. One pack per dental service SetMo can run calls for.
// Services without a pack yet aren't startable — the Agent row's status decides
// what clients see (LIVE / DRAFT / PLANNED), and session creation refuses
// anything that isn't LIVE.
const PACKS: Partial<Record<ServiceKey, ServicePack>> = {
  IMPLANT: IMPLANT_PACK,
  GENERAL: GENERAL_NEW_PATIENT_PACK,
};

// Every rubric that has ever scored a call, by id. Evaluations store their
// rubric id, so a rubric stays here for as long as its calls do — even after a
// newer version takes over.
const RUBRICS: Record<string, Rubric> = {
  [IMPLANT_RUBRIC_V1.id]: IMPLANT_RUBRIC_V1,
  [GENERAL_NP_RUBRIC_V1.id]: GENERAL_NP_RUBRIC_V1,
};

/** The rubric a NEW call on this service is graded against. Falls back to the
 *  implant rubric so a service without a pack can never crash a scorer. */
export function rubricForService(serviceType: string): Rubric {
  return PACKS[serviceType as ServiceKey]?.rubric ?? IMPLANT_RUBRIC_V1;
}

/** The rubric a call WAS graded against. Evaluations written before rubric
 *  pinning have no id and are all implant calls. */
export function rubricById(id: string | null | undefined): Rubric {
  return (id && RUBRICS[id]) || IMPLANT_RUBRIC_V1;
}

export function packFor(serviceType: string): ServicePack | null {
  return PACKS[serviceType as ServiceKey] ?? null;
}

export function hasPack(serviceType: string): boolean {
  return Boolean(PACKS[serviceType as ServiceKey]);
}

/** Packs that generate their own leads — what the offline realism gate checks. */
export function PACKS_WITH_PERSONA(): ServicePack[] {
  return Object.values(PACKS).filter((p): p is ServicePack => Boolean(p?.persona));
}

// Registry-wide skill lookup: every skill key in every rubric. Keys are unique
// across the catalog by construction — a key means exactly one thing, so
// heatmaps, goals and trainings can join on it.
const SKILL_BY_KEY = new Map<string, RubricSkill>();
for (const rubric of Object.values(RUBRICS)) {
  for (const skill of rubric.skills) {
    const existing = SKILL_BY_KEY.get(skill.key);
    if (existing && existing.name !== skill.name) {
      throw new Error(`Skill key "${skill.key}" is defined differently in two rubrics — a key must mean one thing.`);
    }
    SKILL_BY_KEY.set(skill.key, skill);
  }
}

export function skillDef(key: string): RubricSkill | null {
  return SKILL_BY_KEY.get(key) ?? null;
}
