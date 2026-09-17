import type { ServicePack, Rubric } from "@/lib/packs/types";

// The implant / full-arch pack — SetMo's proven call and the reference rubric.
// FROZEN: every stored score in production was graded against these 8 skills in
// this order, with the guide text below. Change the wording and old calls stop
// meaning the same thing, so edits here require a new rubric version.
export const IMPLANT_RUBRIC_V1: Rubric = {
  id: "implant.v1",
  family: "implant",
  bookedDefinition:
    "The lead agreed to a consultation — a committed time, a clear yes to coming in, or an accepted booking.",
  skills: [
    { key: "rapport", name: "Rapport & warmth", short: "Rapport", tier: "universal", guide: "genuine human connection, warm tone, put the lead at ease." },
    { key: "listening", name: "Listening & empathy", short: "Listening", tier: "universal", guide: "active listening, reflected the lead's words/feelings, didn't talk over." },
    { key: "discovery", name: "Discovery — the 'why'", short: "Discovery", tier: "service_specific", guide: "uncovered the real motivation driving the inquiry." },
    { key: "painpoint", name: "Pain-point exploration", short: "Pain-point", tier: "service_specific", guide: "explored functional + emotional pain and its consequences." },
    { key: "objection", name: "Objection handling", short: "Objection", tier: "universal", guide: "addressed concerns (price, fear, spouse, timing) without being pushy." },
    { key: "confidence", name: "Confidence & leadership", short: "Confidence", tier: "universal", guide: "led the call with calm, assured authority." },
    { key: "value", name: "Value building", short: "Value", tier: "service_specific", guide: "tied the outcome to the lead's goals/value, not just price." },
    { key: "closing", name: "Closing the appt", short: "Closing", tier: "universal", guide: "clearly asked for and secured a booked appointment." },
  ],
};

export const IMPLANT_PACK: ServicePack = {
  service: "IMPLANT",
  name: "Implants & full-arch",
  blurb: "High-ticket reconstructive cases — the flagship call.",
  caseValue: "$25k–45k",
  rubric: IMPLANT_RUBRIC_V1,
};
