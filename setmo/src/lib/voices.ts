// ElevenLabs voice library for the AI LEAD, split by gender so a generated
// persona gets a gender-matched voice. Each call picks one at random for variety.
// (Voice override must be enabled on the agent's Security → Overrides settings.)

export type Voice = { name: string; id: string };

export const VOICES: { male: Voice[]; female: Voice[] } = {
  male: [
    { name: "Jon", id: "sB7vwSCyX0tQmU24cW2C" },
    { name: "Chris", id: "B5wiYbiNK3GCUhkdcM4n" },
    { name: "Brian", id: "gPPH6SLdL8XSX6GNJ40G" },
    { name: "Josh", id: "wSO34DbFKBGmeCNpJL5K" },
    { name: "Victor", id: "KSGYe0fMqoZR5BREvtf1" },
    { name: "Heyez", id: "6rr4jpS124uCLNtgVdAk" },
    { name: "Dan", id: "v54DUrx2qPTkyzeYbsyW" },
  ],
  female: [
    { name: "Lauren", id: "DODLEQrClDo8wCz460ld" },
    { name: "Lorena", id: "l006hw6wZaEYAv80cbzj" },
    { name: "Michelle", id: "xg7RXypgOlRSIidsSV4l" },
    { name: "Kerrigan", id: "Jx2DcubqtuDwtMXY7odW" },
    { name: "Angela", id: "FUfBrNit0NNZAwb58KWH" },
    { name: "Octavia", id: "yJLlp2SHBZbo4wKGgSUY" },
    { name: "Vexa", id: "WPSw8dUqeNii5nBXr9gS" },
    { name: "Nia", id: "CBHdTdZwkV4jYoCyMV1B" },
    { name: "Ms Walker", id: "DLsHlh26Ugcm6ELvS0qi" },
  ],
};

export function pickVoice(gender: "male" | "female", seed?: number): Voice {
  const list = VOICES[gender] ?? VOICES.female;
  const i = seed != null ? seed % list.length : Math.floor(Math.random() * list.length);
  return list[i];
}
