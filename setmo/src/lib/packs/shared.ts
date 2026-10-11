import type { RubricSkill } from "@/lib/packs/types";
import { IMPLANT_RUBRIC_V1 } from "@/lib/packs/implant";

// The five skills every call type grades the same way. They come from the
// implant rubric itself, so a shared key can never drift from what it means
// there (the registry refuses two definitions of one key).
const byKey = new Map(IMPLANT_RUBRIC_V1.skills.map((s) => [s.key, s]));
const shared = (key: string): RubricSkill => {
  const skill = byKey.get(key);
  if (!skill) throw new Error(`No shared skill "${key}" in the implant rubric.`);
  return skill;
};

export const SHARED_SKILLS = {
  rapport: shared("rapport"),
  listening: shared("listening"),
  objection: shared("objection"),
  confidence: shared("confidence"),
  closing: shared("closing"),
};
