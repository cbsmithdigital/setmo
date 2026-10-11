import type { ServicePack, Rubric } from "@/lib/packs/types";
import type { PersonaSpec } from "@/lib/realism/sampler";
import { SHARED_SKILLS } from "@/lib/packs/shared";

// ---------------------------------------------------------------------------
// Ortho & Invisalign.
//
// Two different callers share this line: a parent phoning about a child or a
// teen (the patient never comes to the phone), and an adult who wants
// straighter teeth for themselves, usually with clear aligners in mind. The
// setter's job is to work out which consultation fits, untangle the
// orthodontic benefit and payment questions without guessing, and make the
// consultation feel worth the trip.
// ---------------------------------------------------------------------------

export const ORTHO_RUBRIC_V1: Rubric = {
  id: "ortho.v1",
  family: "ortho",
  bookedDefinition:
    "The caller accepted a specific date and time for an orthodontic consultation, with a parent or guardian attending if the patient is a minor.",
  skills: [
    SHARED_SKILLS.rapport,
    SHARED_SKILLS.listening,
    {
      key: "orth_candidate_triage",
      name: "Candidate triage",
      short: "Triage",
      tier: "service_specific",
      guide:
        "established who the patient is (child, teen or adult) and their age, what they've noticed or been told (crowding, gaps, the bite, a dentist's referral), any earlier braces or retainer, and what they're hoping for (braces or clear aligners) — then matched them to the right consultation instead of a one-size pitch.",
    },
    {
      key: "orth_benefits_payment",
      name: "Ortho benefits & payment",
      short: "Benefits",
      tier: "service_specific",
      guide:
        "handled the money questions specific to orthodontics — whether their plan has an orthodontic benefit (often a lifetime maximum with an age limit, separate from regular dental), that the practice will check it, and how payment usually works (a down payment and a monthly plan) — without guaranteeing coverage or quoting a final fee before the exam.",
    },
    SHARED_SKILLS.objection,
    SHARED_SKILLS.confidence,
    {
      key: "orth_consult_framing",
      name: "Consult framing",
      short: "Consult",
      tier: "service_specific",
      guide:
        "described what the consultation includes (exam, photos or a scan, x-rays, treatment options and timeline, and the cost breakdown), how long it takes and who should come — a parent or guardian for a minor — and tied it to the caller's goal so the visit felt worth making.",
    },
    SHARED_SKILLS.closing,
  ],
};

export const ORTHO_PERSONA: PersonaSpec = {
  patientAge: [7, 55],
  callerMix: [
    { role: "SELF", weight: 50 },
    { role: "PARENT", weight: 46 },
    { role: "GUARDIAN", weight: 4 },
  ],
  tones: [
    "organized, with a list of questions",
    "busy, calling between things",
    "price-focused",
    "self-conscious",
    "skeptical of being upsold",
    "friendly and chatty",
    "keen to get started",
  ],
  coverages: [
    { key: "PPO", weight: 48 },
    { key: "UNINSURED", weight: 22 },
    { key: "MEDICAID", weight: 12 },
    { key: "DHMO", weight: 10 },
    { key: "CHIP", weight: 8 },
  ],
  leadSources: [
    { key: "fb_ad", weight: 22 },
    { key: "google_form", weight: 22 },
    { key: "ig_ad", weight: 18 },
    { key: "referral", weight: 14 },
    { key: "website_quiz", weight: 12 },
    { key: "maps_request", weight: 12 },
  ],
  concerns: [
    { key: "cost", label: "Cost or monthly payment" },
    { key: "insurance", label: "Ortho insurance questions" },
    { key: "timing", label: "How long treatment takes" },
    { key: "schedule", label: "Appointments around school or work" },
    { key: "doubt", label: "Doubts it'll work or is needed" },
    { key: "early", label: "Not sure it's needed yet" },
    { key: "pressure", label: "Worried it's a sales pitch" },
    { key: "shopping", label: "Comparing offices or at-home kits" },
    { key: "spouse", label: "Other parent or partner has to agree" },
    { key: "visit", label: "Unsure what the visit involves" },
  ],
  archetypes: [
    {
      key: "child_first_check",
      interest: "An early orthodontic check",
      sources: [
        { key: "google_form", weight: 35 },
        { key: "referral", weight: 30 },
        { key: "maps_request", weight: 20 },
        { key: "fb_ad", weight: 15 },
      ],
      weight: 14,
      patientAge: [7, 10],
      callerRoles: ["PARENT", "GUARDIAN"],
      dentition: ["mixed_child"],
      situations: [
        "their dentist suggested the child see an orthodontist",
        "the adult front teeth are coming in crooked",
        "the child's bite looks off when they smile",
      ],
      drivers: [
        "they had braces for years as a kid and want it easier for their child",
        "the child is starting to get teased at school",
        "they'd rather know now than be surprised later",
      ],
      objections: [
        { text: "asks whether their child isn't too young to see an orthodontist", difficulty: "WARM", concern: "early" },
        { text: "wants to know if the consultation is just a sales pitch", difficulty: "ADAPTIVE", concern: "pressure" },
        { text: "says they'll wait until all the adult teeth are in", difficulty: "TOUGH", concern: "early" },
      ],
      urgency: "none",
      lastVisit: [0, 1],
    },
    {
      key: "teen_braces",
      interest: "Braces for a teen",
      sources: [
        { key: "google_form", weight: 30 },
        { key: "fb_ad", weight: 25 },
        { key: "referral", weight: 25 },
        { key: "maps_request", weight: 20 },
      ],
      weight: 20,
      patientAge: [11, 17],
      callerRoles: ["PARENT", "GUARDIAN"],
      dentition: ["full_natural", "mixed_child"],
      situations: [
        "their teen's teeth are crowded and the dentist recommended braces",
        "their teen has an overbite that's getting more noticeable",
        "their teen asked for braces because their friends have them",
      ],
      drivers: [
        "their teen won't smile in school pictures anymore",
        "they'd rather do it now than when their teen is older and busier",
        "they regret not doing it for an older sibling",
      ],
      objections: [
        { text: "asks whether clear aligners actually work for a teenager", difficulty: "WARM", concern: "doubt" },
        { text: "can only do appointments after school", difficulty: "WARM", concern: "schedule" },
        { text: "wants to know what the monthly payment would be", difficulty: "ADAPTIVE", concern: "cost" },
        { text: "needs to check with the other parent or their partner before committing", difficulty: "ADAPTIVE", concern: "spouse" },
        { text: "says insurance only covers part of it and another office is cheaper", difficulty: "TOUGH", concern: "shopping", coverage: ["PPO", "DHMO"] },
      ],
      urgency: "none",
      lastVisit: [0, 2],
    },
    {
      key: "adult_aligners",
      interest: "Clear aligners",
      sources: [
        { key: "ig_ad", weight: 30 },
        { key: "fb_ad", weight: 25 },
        { key: "website_quiz", weight: 25 },
        { key: "google_form", weight: 20 },
      ],
      weight: 20,
      patientAge: [22, 55],
      callerRoles: ["SELF"],
      dentition: ["full_natural", "some_missing"],
      situations: [
        "has wanted straighter teeth for years and keeps seeing aligner ads",
        "their bottom teeth have gotten more crowded over the last few years",
        "has a wedding next year and wants straighter teeth in time",
      ],
      drivers: [
        "they're self-conscious in meetings and on camera",
        "they never got braces because their family couldn't afford it",
        "they want to do something for themselves for once",
      ],
      objections: [
        { text: "asks how long treatment takes", difficulty: "WARM", concern: "timing" },
        { text: "wonders if an at-home aligner kit would be cheaper", difficulty: "ADAPTIVE", concern: "shopping" },
        { text: "wants a price on the phone and won't come in otherwise", difficulty: "TOUGH", concern: "cost" },
      ],
      urgency: "none",
      lastVisit: [0, 5],
    },
    {
      key: "shifted_after_braces",
      interest: "Teeth that shifted after braces",
      sources: [
        { key: "google_form", weight: 35 },
        { key: "ig_ad", weight: 25 },
        { key: "fb_ad", weight: 20 },
        { key: "maps_request", weight: 20 },
      ],
      weight: 14,
      patientAge: [18, 45],
      callerRoles: ["SELF"],
      dentition: ["full_natural"],
      situations: [
        "had braces as a teen but stopped wearing the retainer",
        "their front teeth have crept back out of line",
        "lost their retainer years ago and a gap is opening up again",
      ],
      drivers: [
        "they feel guilty because their parents paid a lot for the braces",
        "they want to fix it before it gets worse",
        "a coworker commented on their teeth",
      ],
      objections: [
        { text: "hopes it's a quick fix and not braces all over again", difficulty: "WARM", concern: "timing" },
        { text: "asks whether their plan has any orthodontic benefit for adults", difficulty: "ADAPTIVE", concern: "insurance", coverage: ["PPO", "DHMO"] },
        { text: "says they'll just order a retainer online", difficulty: "TOUGH", concern: "shopping" },
      ],
      urgency: "none",
      lastVisit: [0, 4],
    },
    {
      key: "using_ortho_benefit",
      interest: "Braces with insurance",
      sources: [
        { key: "insurance_voicemail", weight: 35 },
        { key: "google_form", weight: 35 },
        { key: "maps_request", weight: 30 },
      ],
      weight: 14,
      patientAge: [9, 17],
      callerRoles: ["PARENT", "GUARDIAN"],
      dentition: ["mixed_child", "full_natural"],
      coverage: ["PPO", "DHMO", "MEDICAID", "CHIP"],
      situations: [
        { text: "their plan has an orthodontic benefit and they want to use it before the child ages out", coverage: ["PPO", "DHMO"] },
        { text: "wants to know whether the state plan will cover braces", coverage: ["MEDICAID", "CHIP"] },
        "the child's dentist referred them and they want to know what's covered",
      ],
      drivers: [
        "money is tight and they can only do it if insurance helps",
        "they don't want to start and get stuck with a surprise bill",
        "they want the child to have what they never had",
      ],
      objections: [
        { text: "asks if the practice will check their benefits before the consultation", difficulty: "WARM", concern: "insurance" },
        { text: "wants to know the down payment if insurance pays part", difficulty: "ADAPTIVE", concern: "cost", coverage: ["PPO", "DHMO"] },
        { text: "is sure the state plan will pay for everything and gets frustrated when it might not", difficulty: "TOUGH", concern: "insurance", coverage: ["MEDICAID", "CHIP"] },
      ],
      urgency: "soon",
      lastVisit: [0, 1],
    },
    {
      key: "bite_problem",
      interest: "A bite problem",
      sources: [
        { key: "google_form", weight: 35 },
        { key: "referral", weight: 25 },
        { key: "maps_request", weight: 25 },
        { key: "voicemail", weight: 15 },
      ],
      weight: 12,
      patientAge: [12, 40],
      callerRoles: ["SELF", "PARENT", "GUARDIAN"],
      dentition: ["full_natural", "some_missing"],
      situations: [
        "their dentist says the bite is wearing down the teeth",
        "the jaw clicks and gets sore when chewing",
        "the front teeth don't meet when biting down",
      ],
      drivers: [
        "they're worried about the teeth wearing out",
        "the jaw soreness is making it hard to sleep",
        "they want to head off bigger problems later",
      ],
      objections: [
        { text: "asks what actually happens at the first visit", difficulty: "WARM", concern: "visit" },
        { text: "worried treatment will take years", difficulty: "ADAPTIVE", concern: "timing" },
        { text: "asks if it's really needed or if the dentist is just passing them along", difficulty: "TOUGH", concern: "doubt" },
      ],
      urgency: "soon",
      lastVisit: [0, 2],
    },
  ],
};

export const ORTHO_PACK: ServicePack = {
  service: "ORTHO",
  name: "Ortho & Invisalign",
  blurb: "Braces and clear-aligner consultation booking.",
  caseValue: "$4k–7k",
  callAbout: "straightening teeth — braces or clear aligners",
  offer: "an orthodontic consultation — exam, photos and x-rays, and a plan with timing and payment options",
  appointment: "an orthodontic consultation",
  adOffer: "Orthodontic consultation — braces & clear aligners",
  rubric: ORTHO_RUBRIC_V1,
  persona: ORTHO_PERSONA,
};
