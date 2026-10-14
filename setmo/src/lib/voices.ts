// ElevenLabs voice library for the AI LEAD: each voice's gender and the caller
// ages it suits. A lead gets a voice of its caller's gender that suits their age
// (pickVoiceFor in src/lib/realism/voices.ts). Adam listened to all of them
// (2026-10-09): the original sixteen work at any age; the newer ones carry the
// ages he gave them.
// Every voice here must be in the ElevenLabs account's My Voices: a voice that
// isn't is silently replaced by the agent's default voice (Ms Walker), with no
// error. (Voice override must also be enabled on the agent's Security → Overrides
// settings — it is.)

export type Voice = { name: string; id: string };

/** The caller ages a voice suits: any adult, a young adult up to their mid 30s,
 *  or 30 and older. */
export type VoiceAges = "any" | "young" | "30+";

export const VOICE_AGE_RANGE: Record<VoiceAges, [number, number]> = {
  any: [18, 120],
  young: [18, 35],
  "30+": [30, 120],
};

export type VoiceMeta = Voice & { gender: "male" | "female"; ages: VoiceAges };

export const VOICE_CATALOG: VoiceMeta[] = [
  // Men
  { name: "Jon", id: "sB7vwSCyX0tQmU24cW2C", gender: "male", ages: "any" },
  { name: "Chris", id: "B5wiYbiNK3GCUhkdcM4n", gender: "male", ages: "any" },
  { name: "Brian", id: "gPPH6SLdL8XSX6GNJ40G", gender: "male", ages: "any" },
  { name: "Josh", id: "wSO34DbFKBGmeCNpJL5K", gender: "male", ages: "any" },
  { name: "Victor", id: "KSGYe0fMqoZR5BREvtf1", gender: "male", ages: "any" },
  { name: "Heyez", id: "6rr4jpS124uCLNtgVdAk", gender: "male", ages: "any" },
  { name: "Dan", id: "v54DUrx2qPTkyzeYbsyW", gender: "male", ages: "any" },
  // "Andre Rene" in the Voice Library (Adam's pick, 2026-10-14; any age, as he
  // first described Andre). The library's other André (nlkkWck0nIz1Nd4Bydut) he
  // didn't like, and the id first given for Andre is "Hope", a woman.
  { name: "Andre", id: "GogJbMCDT0Viv4cU3N4s", gender: "male", ages: "any" },
  { name: "Josh 2", id: "ZoiZ8fuDWInAcwPXaVeq", gender: "male", ages: "any" }, // a second voice Adam calls Josh
  { name: "Aiden", id: "EOVAuWqgSZN2Oel78Psj", gender: "male", ages: "young" },
  { name: "Miles", id: "vSjOBQp24DUB2COr2xI9", gender: "male", ages: "young" },
  // Women
  { name: "Lauren", id: "DODLEQrClDo8wCz460ld", gender: "female", ages: "any" },
  { name: "Lorena", id: "l006hw6wZaEYAv80cbzj", gender: "female", ages: "any" },
  { name: "Michelle", id: "xg7RXypgOlRSIidsSV4l", gender: "female", ages: "any" },
  { name: "Kerrigan", id: "Jx2DcubqtuDwtMXY7odW", gender: "female", ages: "any" },
  { name: "Angela", id: "FUfBrNit0NNZAwb58KWH", gender: "female", ages: "any" },
  { name: "Octavia", id: "yJLlp2SHBZbo4wKGgSUY", gender: "female", ages: "any" },
  { name: "Vexa", id: "WPSw8dUqeNii5nBXr9gS", gender: "female", ages: "any" },
  { name: "Nia", id: "CBHdTdZwkV4jYoCyMV1B", gender: "female", ages: "any" },
  { name: "Ms Walker", id: "DLsHlh26Ugcm6ELvS0qi", gender: "female", ages: "any" },
  { name: "Liz", id: "uMM5TEnpKKgD758knVJO", gender: "female", ages: "any" },
  { name: "Eve", id: "BZgkqPqms7Kj9ulSkVzn", gender: "female", ages: "any" },
  { name: "Sia", id: "CUvmi6RSy4BQr6vnMyEw", gender: "female", ages: "30+" },
  { name: "Amy", id: "bMxLr8fP6hzNRRi9nJxU", gender: "female", ages: "young" },
];

/** Whether a voice suits a caller of this gender and age. */
export function voiceSuits(v: VoiceMeta, gender: "male" | "female", age: number): boolean {
  const [lo, hi] = VOICE_AGE_RANGE[v.ages];
  return v.gender === gender && age >= lo && age <= hi;
}
