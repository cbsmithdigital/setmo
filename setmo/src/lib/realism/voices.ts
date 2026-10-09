import { VOICE_CATALOG, voiceSuits, type VoiceMeta } from "@/lib/voices";
import { ageBand, type AgeBand } from "@/lib/realism/types";
import type { Rng } from "@/lib/realism/rng";

// Voices made for young adults come up more often for a caller that young, so a
// 25-year-old usually sounds young without every young caller sharing one voice
// (the any-age voices still come up too).
const YOUNG_VOICE_WEIGHT = 3;

/** A voice for the person actually on the phone: their gender, suited to their
 *  age. Never a child — a caller is always an adult, and a child patient never
 *  speaks. */
export function pickVoiceFor(
  rng: Rng,
  opts: { gender: "male" | "female"; age: number; exclude?: string[] }
): { id: string; name: string; band: AgeBand; bandMatched: boolean } {
  const age = Math.max(18, opts.age);
  const suited = VOICE_CATALOG.filter((v) => voiceSuits(v, opts.gender, age));
  const fresh = suited.filter((v) => !opts.exclude?.includes(v.id));
  // Never the wrong gender. Only if no voice suits the age (the any-age voices
  // make that impossible today) does a caller borrow another adult voice.
  const pool: VoiceMeta[] = fresh.length ? fresh : suited.length ? suited : VOICE_CATALOG.filter((v) => v.gender === opts.gender);
  const chosen = rng.weighted(pool.map((v) => ({ item: v, weight: v.ages === "young" ? YOUNG_VOICE_WEIGHT : 1 })));
  return { id: chosen.id, name: chosen.name, band: ageBand(age), bandMatched: suited.length > 0 };
}

/** Caller ages no voice suits, per gender, as ranges ("female 76-120") — what to
 *  record next. Empty while every adult age has a voice. */
export function voiceGaps(): string[] {
  const gaps: string[] = [];
  for (const gender of ["male", "female"] as const) {
    let start: number | null = null;
    for (let age = 18; age <= 121; age++) {
      const covered = age <= 120 && VOICE_CATALOG.some((v) => voiceSuits(v, gender, age));
      if (!covered && start == null && age <= 120) start = age;
      if ((covered || age === 121) && start != null) {
        gaps.push(`${gender} ${start}-${age - 1}`);
        start = null;
      }
    }
  }
  return gaps;
}
