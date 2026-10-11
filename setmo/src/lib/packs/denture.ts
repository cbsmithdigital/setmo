import type { ServicePack, Rubric } from "@/lib/packs/types";
import type { PersonaSpec } from "@/lib/realism/sampler";
import { SHARED_SKILLS } from "@/lib/packs/shared";

// ---------------------------------------------------------------------------
// Dentures & snap-in.
//
// Someone living with failing teeth, a loose or broken denture, or a partial
// that never worked — often older, often on a fixed income, often embarrassed.
// The setter's job is to find out what it does to their day, get them to the
// consultation where the dentist lays out the options (a new full or partial
// denture, an immediate denture, or one that snaps onto implants), and be
// straight about cost and coverage without quoting or promising.
// ---------------------------------------------------------------------------

export const DENTURE_RUBRIC_V1: Rubric = {
  id: "denture.v1",
  family: "denture",
  bookedDefinition:
    "The caller accepted a specific date and time for a denture consultation (exam, x-rays and a look at the options) — for themselves, or for the person they're calling about, with a plan for how that person gets there.",
  skills: [
    SHARED_SKILLS.rapport,
    SHARED_SKILLS.listening,
    {
      key: "dent_daily_impact",
      name: "Daily-life impact",
      short: "Daily impact",
      tier: "service_specific",
      guide:
        "found out what their teeth or denture actually do to their day — what they avoid eating, slipping or clicking when they talk, adhesive, sore spots, hiding their smile — and why they're calling now; reflected it back in the caller's own words before talking about solutions.",
    },
    {
      key: "dent_options_clarity",
      name: "Options without overpromising",
      short: "Options",
      tier: "service_specific",
      guide:
        "explained in plain words that the consultation is where the dentist examines them and walks through the options — a new full or partial denture, an immediate denture if teeth need to come out, or a denture that snaps onto a few implants — without diagnosing over the phone, promising a result, or quoting a final price; answered 'how long will it take' and 'will I be without teeth' honestly (the dentist plans it, and most people aren't left without teeth).",
    },
    SHARED_SKILLS.objection,
    SHARED_SKILLS.confidence,
    {
      key: "dent_cost_path",
      name: "Cost & coverage path",
      short: "Cost path",
      tier: "service_specific",
      guide:
        "handled cost honestly for a denture patient — what their plan, Medicare Advantage allowance or Medicaid typically does for dentures, that the practice will check it, and that payment options exist — without guaranteeing coverage, naming a final price, or pressuring; kept the consultation as the place to get a real number.",
    },
    SHARED_SKILLS.closing,
  ],
};

export const DENTURE_PERSONA: PersonaSpec = {
  patientAge: [40, 95],
  callerMix: [
    { role: "SELF", weight: 68 },
    { role: "ADULT_CHILD", weight: 17 },
    { role: "SPOUSE", weight: 10 },
    { role: "CAREGIVER", weight: 5 },
  ],
  tones: [
    "practical and to the point",
    "worn down by it",
    "guarded about cost",
    "embarrassed and quiet",
    "chatty, tells stories",
    "skeptical — burned by a denture before",
    "hopeful but cautious",
  ],
  coverages: [
    { key: "PPO", weight: 26 },
    { key: "UNINSURED", weight: 26 },
    { key: "MEDICARE_ADVANTAGE", weight: 22 },
    { key: "MEDICAID", weight: 12 },
    { key: "MEDICARE_ONLY", weight: 10 },
    { key: "VA", weight: 3 },
  ],
  leadSources: [
    { key: "fb_ad", weight: 26 },
    { key: "google_form", weight: 22 },
    { key: "voicemail", weight: 14 },
    { key: "maps_request", weight: 12 },
    { key: "referral", weight: 10 },
    { key: "website_quiz", weight: 8 },
    { key: "insurance_voicemail", weight: 8 },
  ],
  concerns: [
    { key: "cost", label: "Cost" },
    { key: "insurance", label: "Insurance or Medicare questions" },
    { key: "fear", label: "Scared of extractions or pain" },
    { key: "doubt", label: "Doubts a new denture will be better" },
    { key: "age", label: "Not sure it's worth it at their age" },
    { key: "timing", label: "How long it takes" },
    { key: "spouse", label: "Spouse has to agree" },
    { key: "shopping", label: "Shopping around" },
    { key: "visit", label: "Unsure what the visit involves" },
  ],
  archetypes: [
    {
      key: "loose_old_denture",
      interest: "A new denture that fits",
      sources: [
        { key: "voicemail", weight: 25 },
        { key: "google_form", weight: 30 },
        { key: "fb_ad", weight: 25 },
        { key: "referral", weight: 20 },
      ],
      weight: 18,
      patientAge: [58, 92],
      callerRoles: ["SELF", "SPOUSE", "ADULT_CHILD", "CAREGIVER"],
      dentition: ["full_dentures", "full_upper_denture"],
      situations: [
        "their full denture is more than ten years old and slips when they eat",
        "they've been using more and more adhesive just to get through a meal",
        "the denture rubs a sore spot that keeps coming back",
      ],
      drivers: [
        "they've quietly stopped eating out with friends",
        "they're afraid it'll slip while they're talking to someone",
        "a grandchild asked why their teeth click",
      ],
      objections: [
        { text: "asks whether a new denture will really fit any better than this one", difficulty: "WARM", concern: "doubt" },
        { text: "worried about what a new denture costs on a fixed income", difficulty: "ADAPTIVE", concern: "cost" },
        { text: "thinks their plan pays for a new denture whenever they want one, and gets upset when it might not", difficulty: "TOUGH", concern: "insurance", coverage: ["PPO", "MEDICARE_ADVANTAGE", "MEDICAID"] },
      ],
      urgency: "none",
      lastVisit: [3, 15],
    },
    {
      key: "failing_teeth",
      interest: "Options for failing teeth",
      sources: [
        { key: "fb_ad", weight: 35 },
        { key: "google_form", weight: 30 },
        { key: "maps_request", weight: 20 },
        { key: "website_quiz", weight: 15 },
      ],
      weight: 16,
      patientAge: [45, 80],
      callerRoles: ["SELF", "SPOUSE"],
      dentition: ["some_missing", "partial_denture"],
      situations: [
        "several back teeth are broken and the front ones are getting loose",
        "a dentist told them years ago the rest of their teeth would eventually need to come out",
        "they've been chewing on one side for months because of a bad tooth",
      ],
      drivers: [
        "they're tired of hiding their smile in every photo",
        "an infection last winter scared them",
        "they've been turning down invitations because they're embarrassed",
      ],
      objections: [
        { text: "wants to understand what would happen to their teeth before agreeing to anything", difficulty: "WARM", concern: "visit" },
        { text: "scared of having teeth pulled", difficulty: "ADAPTIVE", concern: "fear" },
        { text: "wants a price for 'the whole thing' over the phone before coming in", difficulty: "TOUGH", concern: "cost" },
      ],
      urgency: "soon",
      lastVisit: [3, 15],
    },
    {
      key: "partial_problems",
      interest: "A better partial",
      sources: [
        { key: "google_form", weight: 30 },
        { key: "maps_request", weight: 25 },
        { key: "voicemail", weight: 25 },
        { key: "referral", weight: 20 },
      ],
      weight: 12,
      patientAge: [45, 85],
      callerRoles: ["SELF", "SPOUSE", "ADULT_CHILD"],
      dentition: ["partial_denture"],
      situations: [
        "the metal clasp on their partial shows when they smile",
        "their partial broke and they've been going without it",
        "food gets stuck under the partial at every meal",
      ],
      drivers: [
        "they're self-conscious talking to people",
        "they miss eating the foods they love",
        "they're tired of taking it out and keeping it in a cup at night",
      ],
      objections: [
        { text: "wants to know if the old partial can just be repaired", difficulty: "WARM", concern: "visit" },
        { text: "asks whether insurance will pay for a new partial so soon after the last one", difficulty: "ADAPTIVE", concern: "insurance", coverage: ["PPO", "MEDICAID", "MEDICARE_ADVANTAGE"] },
        { text: "says the last partial cost a lot and never fit, and wants a guarantee this one will", difficulty: "TOUGH", concern: "doubt" },
      ],
      urgency: "none",
      lastVisit: [1, 8],
    },
    {
      key: "snap_in_curious",
      interest: "Snap-in dentures",
      sources: [
        { key: "fb_ad", weight: 35 },
        { key: "website_quiz", weight: 25 },
        { key: "google_form", weight: 20 },
        { key: "ig_ad", weight: 20 },
      ],
      weight: 14,
      patientAge: [55, 85],
      callerRoles: ["SELF", "SPOUSE"],
      dentition: ["full_dentures", "full_upper_denture"],
      situations: [
        "saw an ad for dentures that snap onto implants and wants to know if they'd qualify",
        "a friend got snap-in dentures and won't stop talking about them",
        "their denture floats around and they've heard implants can hold it in place",
      ],
      drivers: [
        "they want to bite into an apple again",
        "they're done with the paste and the mess",
        "they want to feel normal at the dinner table with family",
      ],
      objections: [
        { text: "wants to know how many visits it takes from start to finish", difficulty: "WARM", concern: "timing" },
        { text: "heard snap-in dentures cost as much as a car and assumes they're out of reach", difficulty: "ADAPTIVE", concern: "cost" },
        { text: "needs to talk it over with their spouse before any big decision", difficulty: "ADAPTIVE", concern: "spouse" },
        { text: "worried that implant surgery is too much at their age", difficulty: "TOUGH", concern: "age" },
      ],
      urgency: "none",
      lastVisit: [2, 10],
    },
    {
      key: "parent_dentures",
      interest: "Dentures for a parent",
      sources: [
        { key: "google_form", weight: 40 },
        { key: "voicemail", weight: 30 },
        { key: "maps_request", weight: 30 },
      ],
      weight: 12,
      patientAge: [70, 95],
      callerRoles: ["ADULT_CHILD"],
      dentition: ["full_dentures", "full_upper_denture", "partial_denture"],
      situations: [
        "the denture broke a week ago and they've been living on soup since",
        "they've lost weight and the denture won't stay in anymore",
        "they haven't seen a dentist in years and can barely chew now",
      ],
      drivers: [
        "they feel guilty they didn't notice sooner",
        "their parent has stopped eating with the family",
        "they don't want their parent embarrassed in front of the grandkids",
      ],
      objections: [
        { text: "needs an appointment they can bring their parent to on a day off work", difficulty: "WARM", concern: "timing" },
        { text: "isn't sure what their parent's plan covers for dentures", difficulty: "ADAPTIVE", concern: "insurance", coverage: ["MEDICARE_ADVANTAGE", "MEDICARE_ONLY", "MEDICAID", "PPO"] },
        { text: "worried the whole process will be too much for their parent at this age", difficulty: "TOUGH", concern: "age" },
      ],
      urgency: "soon",
      lastVisit: [3, 15],
    },
    {
      key: "event_deadline",
      interest: "Teeth before a big event",
      sources: [
        { key: "fb_ad", weight: 35 },
        { key: "google_form", weight: 30 },
        { key: "maps_request", weight: 20 },
        { key: "ig_ad", weight: 15 },
      ],
      weight: 10,
      patientAge: [45, 70],
      callerRoles: ["SELF"],
      dentition: ["some_missing", "partial_denture", "full_upper_denture"],
      situations: [
        "their daughter's wedding is a few months away and they won't smile in the photos",
        "they're starting a new job and want to look put-together",
        "a big family reunion is coming up this summer",
      ],
      drivers: [
        "they've hidden their smile for years and want one day without hiding it",
        "they're tired of covering their mouth when they laugh",
        "they want to feel like themselves again",
      ],
      objections: [
        { text: "wants to know if it can all be done in time", difficulty: "WARM", concern: "timing" },
        { text: "scared of being without teeth while they wait", difficulty: "ADAPTIVE", concern: "fear" },
        { text: "says another office quoted a cheaper denture package", difficulty: "TOUGH", concern: "shopping" },
      ],
      urgency: "soon",
      lastVisit: [2, 12],
    },
    {
      key: "paying_cash",
      interest: "New dentures",
      sources: [
        { key: "fb_ad", weight: 45 },
        { key: "google_form", weight: 35 },
        { key: "website_quiz", weight: 20 },
      ],
      weight: 10,
      patientAge: [45, 70],
      callerRoles: ["SELF", "SPOUSE"],
      dentition: ["some_missing", "partial_denture", "full_dentures", "full_upper_denture"],
      coverage: ["UNINSURED"],
      situations: [
        "saw an ad for dentures and wants to know what's actually involved",
        "lost their dental coverage with a job change and needs teeth anyway",
        "has been putting this off for years",
      ],
      drivers: [
        "they're interviewing for jobs and their smile is holding them back",
        "chewing has gotten so hard they're losing weight",
        "they're tired of being the one who never smiles in pictures",
      ],
      objections: [
        { text: "wants the total price before booking anything", difficulty: "ADAPTIVE", concern: "cost" },
        { text: "asks if there's financing without a credit check", difficulty: "ADAPTIVE", concern: "cost" },
        { text: "says they'll just go to the cheapest place in town", difficulty: "TOUGH", concern: "shopping" },
      ],
      urgency: "none",
      lastVisit: [4, 20],
    },
    {
      key: "broken_denture",
      interest: "A broken denture",
      sources: [
        { key: "voicemail", weight: 40 },
        { key: "maps_request", weight: 30 },
        { key: "google_form", weight: 30 },
      ],
      weight: 8,
      patientAge: [55, 92],
      callerRoles: ["SELF", "SPOUSE", "ADULT_CHILD", "CAREGIVER"],
      dentition: ["full_dentures", "full_upper_denture", "partial_denture"],
      situations: [
        "the denture cracked down the middle",
        "a tooth popped off the denture",
        "the denture was dropped and a piece broke off",
      ],
      drivers: [
        "there's a family event this weekend",
        "they've been staying home since it broke",
        "they can't eat properly without it",
      ],
      objections: [
        { text: "asks if it can be fixed the same day", difficulty: "WARM", concern: "timing" },
        { text: "wonders whether a repair is cheaper than a new one", difficulty: "ADAPTIVE", concern: "cost" },
        { text: "only wants it glued back together and doesn't want a whole exam", difficulty: "TOUGH", concern: "visit" },
      ],
      urgency: "soon",
      lastVisit: [1, 10],
    },
  ],
};

export const DENTURE_PACK: ServicePack = {
  service: "DENTURE",
  name: "Dentures & snap-in",
  blurb: "Full, partial and snap-in denture conversations.",
  caseValue: "$3k–12k",
  callAbout: "dentures — a new or replacement denture, a partial, or dentures that snap onto implants",
  offer: "a denture consultation — the dentist examines their mouth, takes x-rays and walks through the options",
  appointment: "a denture consultation",
  adOffer: "Denture consultation — see your options",
  // Snap-in dentures sit on implants, so "implant" talk belongs here; the
  // full-arch implant call's own vocabulary still doesn't.
  lexicon: {
    allowImplantWording: true,
    banned: [
      {
        id: "LX-IMPLANT-LEAK",
        pattern: /\b(all[-\s]?on[-\s]?(4|6|x)|3d (cone beam|scan)|full[-\s]arch)\b/i,
        detail: "full-arch implant wording appeared in a denture lead",
      },
    ],
  },
  rubric: DENTURE_RUBRIC_V1,
  persona: DENTURE_PERSONA,
};
