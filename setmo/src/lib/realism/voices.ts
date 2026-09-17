import { VOICES, type Voice } from "@/lib/voices";
import type { AgeBand } from "@/lib/realism/types";
import type { Rng } from "@/lib/realism/rng";

// Which voices can plausibly carry which caller ages.
//
// The existing 16 voices have never been listened to with an age in mind, so
// they're all marked as the broad adult middle. Nothing claims to be a young
// adult or an older caller until someone audits them — a wrong claim is worse
// than none, because it puts a 30-year-old voice on an 82-year-old caller
// without anyone noticing. `bandMatched: false` on a generated lead marks where
// the roster still needs filling out.
const ADULT_MIDDLE: AgeBand[] = ["30-44", "45-59", "60-74"];

export type VoiceMeta = Voice & { gender: "male" | "female"; bands: AgeBand[] };

export const VOICE_CATALOG: VoiceMeta[] = [
  ...VOICES.male.map((v) => ({ ...v, gender: "male" as const, bands: ADULT_MIDDLE })),
  ...VOICES.female.map((v) => ({ ...v, gender: "female" as const, bands: ADULT_MIDDLE })),
];

/** A voice for the person actually on the phone. Never a child: a caller is
 *  always an adult, and a child patient never speaks. */
export function pickVoiceFor(
  rng: Rng,
  opts: { gender: "male" | "female"; band: AgeBand; exclude?: string[] }
): { id: string; name: string; band: AgeBand; bandMatched: boolean } {
  const sameGender = VOICE_CATALOG.filter((v) => v.gender === opts.gender);
  const fresh = sameGender.filter((v) => !opts.exclude?.includes(v.id));
  const pool = fresh.length ? fresh : sameGender;

  const matching = pool.filter((v) => v.bands.includes(opts.band));
  const chosen = matching.length ? rng.pick(matching) : rng.pick(pool);
  return {
    id: chosen.id,
    name: chosen.name,
    band: opts.band,
    bandMatched: matching.length > 0,
  };
}

/** Caller age bands with no voice that can carry them — what to record next. */
export function unmatchedBands(): AgeBand[] {
  const covered = new Set(VOICE_CATALOG.flatMap((v) => v.bands));
  return (["18-29", "30-44", "45-59", "60-74", "75+"] as AgeBand[]).filter((b) => !covered.has(b));
}
