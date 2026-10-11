import type { ServicePack, Rubric } from "@/lib/packs/types";
import type { PersonaSpec } from "@/lib/realism/sampler";
import { SHARED_SKILLS } from "@/lib/packs/shared";

// ---------------------------------------------------------------------------
// Wisdom teeth.
//
// A surgical booking with a deadline attached: a parent fitting it into a school
// break, a student home for a few weeks, an adult whose dentist has been
// "watching" an impacted tooth for years, someone in pain right now. Fear of
// surgery and sedation runs through all of it. The setter's job is to triage
// the symptoms (and catch anything that can't wait), set calm expectations
// about the consultation, surgery day and recovery, and sort the logistics.
// ---------------------------------------------------------------------------

export const WISDOM_RUBRIC_V1: Rubric = {
  id: "wisdom.v1",
  family: "wisdom",
  bookedDefinition:
    "The caller accepted a specific date and time for a wisdom-teeth consultation (exam and x-ray) — or for the procedure itself when the patient already has x-rays and a referral — with a parent or guardian involved if the patient is a minor.",
  skills: [
    SHARED_SKILLS.rapport,
    SHARED_SKILLS.listening,
    {
      key: "wis_symptom_triage",
      name: "Symptom triage",
      short: "Triage",
      tier: "service_specific",
      guide:
        "asked about pain, swelling, fever, trouble opening the mouth or swallowing, and how long it's been going on; recognized the signs that need to be seen right away (spreading swelling, fever, trouble swallowing or breathing) and routed them accordingly — otherwise matched them to a consultation with an x-ray, or used the referral and x-rays they already have.",
    },
    {
      key: "wis_procedure_expectations",
      name: "Procedure & recovery expectations",
      short: "Expectations",
      tier: "service_specific",
      guide:
        "set calm, plain expectations — what happens at the consultation versus surgery day, sedation choices at a high level, that someone must drive them home after sedation, and typical recovery time off school or work — without giving medical advice or guarantees, and in a way that eased the fear rather than feeding it.",
    },
    SHARED_SKILLS.objection,
    SHARED_SKILLS.confidence,
    {
      key: "wis_logistics",
      name: "Logistics & coverage",
      short: "Logistics",
      tier: "service_specific",
      guide:
        "sorted out the practical blockers — timing around school breaks, work or sports, a driver for surgery day, a parent's consent for a minor, and insurance (dental, and sometimes medical for impacted teeth) with the practice checking benefits — giving a range only if the practice publishes one.",
    },
    SHARED_SKILLS.closing,
  ],
};

export const WISDOM_PERSONA: PersonaSpec = {
  patientAge: [15, 45],
  callerMix: [
    { role: "SELF", weight: 55 },
    { role: "PARENT", weight: 40 },
    { role: "GUARDIAN", weight: 3 },
    { role: "SPOUSE", weight: 2 },
  ],
  tones: [
    "worried and protective",
    "in some pain and short on patience",
    "nervous",
    "matter-of-fact",
    "busy, trying to fit it in",
    "price-focused",
    "skeptical it's needed",
  ],
  coverages: [
    { key: "PPO", weight: 50 },
    { key: "UNINSURED", weight: 22 },
    { key: "MEDICAID", weight: 14 },
    { key: "DHMO", weight: 8 },
    { key: "CHIP", weight: 6 },
  ],
  leadSources: [
    { key: "google_form", weight: 28 },
    { key: "maps_request", weight: 22 },
    { key: "voicemail", weight: 18 },
    { key: "referral", weight: 16 },
    { key: "insurance_voicemail", weight: 8 },
    { key: "fb_ad", weight: 8 },
  ],
  concerns: [
    { key: "fear", label: "Scared of surgery or sedation" },
    { key: "cost", label: "Cost" },
    { key: "insurance", label: "Insurance questions" },
    { key: "schedule", label: "Timing around school or work" },
    { key: "doubt", label: "Not sure it's necessary" },
    { key: "visit", label: "Wants it done at the first visit" },
  ],
  archetypes: [
    {
      key: "referred_teen",
      interest: "Wisdom teeth for a teen",
      sources: [
        { key: "google_form", weight: 35 },
        { key: "referral", weight: 25 },
        { key: "maps_request", weight: 25 },
        { key: "voicemail", weight: 15 },
      ],
      weight: 18,
      patientAge: [15, 17],
      callerRoles: ["PARENT", "GUARDIAN"],
      dentition: ["full_natural"],
      situations: [
        "their dentist saw the wisdom teeth on an x-ray and recommended taking them out",
        "the dentist said the wisdom teeth are coming in sideways",
        "the orthodontist wants the wisdom teeth out before treatment wraps up",
      ],
      drivers: [
        "they want it done before their teen leaves for college",
        "they had a rough time with their own wisdom teeth",
        "their teen is anxious and they want to keep it calm",
      ],
      objections: [
        { text: "wants to do it over a school break", difficulty: "WARM", concern: "schedule" },
        { text: "nervous about their teen being put to sleep", difficulty: "ADAPTIVE", concern: "fear" },
        { text: "isn't convinced it's necessary if nothing hurts", difficulty: "TOUGH", concern: "doubt" },
      ],
      urgency: "none",
      lastVisit: [0, 1],
    },
    {
      key: "college_break",
      interest: "Wisdom teeth out over a break",
      sources: [
        { key: "google_form", weight: 35 },
        { key: "maps_request", weight: 30 },
        { key: "website_booking", weight: 20 },
        { key: "fb_ad", weight: 15 },
      ],
      weight: 16,
      patientAge: [18, 23],
      callerRoles: ["SELF"],
      dentition: ["full_natural"],
      situations: [
        "is home from college for a few weeks and wants them out now",
        "the dentist back home said to get it done before graduation",
        "a back tooth flares up during exams every semester",
      ],
      drivers: [
        "they don't want it ruining another semester",
        "a roommate had a bad infection and it scared them",
        "they want it done before their summer job starts",
      ],
      objections: [
        { text: "needs to know how many days they'll be out of commission", difficulty: "WARM", concern: "schedule" },
        { text: "asks what it costs with their plan", difficulty: "ADAPTIVE", concern: "cost", coverage: ["PPO", "DHMO"] },
        { text: "wants the surgery done at the first visit because they're leaving soon", difficulty: "TOUGH", concern: "visit" },
      ],
      urgency: "soon",
      lastVisit: [0, 2],
    },
    {
      key: "pain_now",
      interest: "Wisdom tooth pain",
      sources: [
        { key: "google_form", weight: 40 },
        { key: "voicemail", weight: 30 },
        { key: "maps_request", weight: 30 },
      ],
      weight: 18,
      patientAge: [18, 40],
      callerRoles: ["SELF", "SPOUSE"],
      dentition: ["full_natural", "some_missing"],
      situations: [
        "the gum behind their last molar is sore and swollen",
        "a throbbing ache in the back of the jaw comes and goes",
        "food keeps getting trapped behind a half-erupted tooth",
      ],
      drivers: [
        "they've been living on painkillers for a week",
        "they have a trip coming up and can't have this flare up",
        "they're scared it's infected",
      ],
      objections: [
        { text: "wants to know if they can be seen this week", difficulty: "WARM", concern: "schedule" },
        { text: "scared of being awake during the procedure", difficulty: "ADAPTIVE", concern: "fear" },
        { text: "wants antibiotics now and to put off surgery", difficulty: "TOUGH", concern: "doubt" },
      ],
      urgency: "soon",
      lastVisit: [0, 8],
    },
    {
      key: "adult_impacted",
      interest: "Impacted wisdom teeth",
      sources: [
        { key: "google_form", weight: 35 },
        { key: "referral", weight: 25 },
        { key: "maps_request", weight: 20 },
        { key: "insurance_voicemail", weight: 20 },
      ],
      weight: 16,
      patientAge: [25, 45],
      callerRoles: ["SELF"],
      dentition: ["full_natural", "some_missing"],
      situations: [
        "their dentist has been watching an impacted wisdom tooth for years",
        "an x-ray showed a wisdom tooth pushing on the molar next to it",
        "they've put off having them out for years",
      ],
      drivers: [
        "the dentist warned it could damage the tooth next to it",
        "they've heard recovery gets harder the older you get",
        "they want it handled before a big life change",
      ],
      objections: [
        { text: "asks what the sedation options are", difficulty: "WARM", concern: "fear" },
        { text: "worried about taking time off work", difficulty: "ADAPTIVE", concern: "schedule" },
        { text: "says it hasn't bothered them in years, so why now", difficulty: "TOUGH", concern: "doubt" },
      ],
      urgency: "none",
      lastVisit: [0, 6],
    },
    {
      key: "coverage_first",
      interest: "Wisdom teeth with insurance",
      sources: [
        { key: "insurance_voicemail", weight: 40 },
        { key: "google_form", weight: 35 },
        { key: "maps_request", weight: 25 },
      ],
      weight: 16,
      patientAge: [15, 22],
      callerRoles: ["SELF", "PARENT", "GUARDIAN"],
      dentition: ["full_natural"],
      coverage: ["PPO", "DHMO", "MEDICAID", "CHIP"],
      situations: [
        { text: "wants to know if the state plan covers wisdom teeth removal", coverage: ["MEDICAID", "CHIP"] },
        { text: "the plan's deductible just reset and they want to plan around it", coverage: ["PPO", "DHMO"] },
        "the referral from the dentist says to check insurance first",
      ],
      drivers: [
        "they can only do it if most of it is covered",
        "they got a surprise bill for something else last year",
        "they want to know the whole cost before saying yes",
      ],
      objections: [
        { text: "asks if the practice is in network", difficulty: "WARM", concern: "insurance", notSources: ["insurance_voicemail"] },
        { text: "wants to know if sedation costs extra", difficulty: "ADAPTIVE", concern: "cost", coverage: ["PPO", "DHMO"] },
        { text: "thinks the plan covers all of it and gets frustrated when it might not", difficulty: "TOUGH", concern: "insurance", coverage: ["MEDICAID", "CHIP"] },
      ],
      urgency: "none",
      lastVisit: [0, 2],
    },
    {
      key: "nervous_patient",
      interest: "Wisdom teeth removal",
      sources: [
        { key: "google_form", weight: 40 },
        { key: "voicemail", weight: 30 },
        { key: "maps_request", weight: 30 },
      ],
      weight: 16,
      patientAge: [16, 35],
      callerRoles: ["SELF", "PARENT", "GUARDIAN"],
      dentition: ["full_natural"],
      situations: [
        "has put off having them out for over a year",
        "the dentist brought it up again at the last cleaning",
        "a wisdom tooth is starting to push through and feels tight",
      ],
      drivers: [
        "they fainted at a blood draw once and dread anything medical",
        "they're afraid of not waking up from anesthesia",
        "they had a bad dental experience as a kid",
      ],
      objections: [
        { text: "wants to know exactly what happens on the day", difficulty: "WARM", concern: "fear" },
        { text: "asks whether they can be completely asleep for it", difficulty: "ADAPTIVE", concern: "fear" },
        { text: "says they'd rather live with it than have surgery", difficulty: "TOUGH", concern: "doubt" },
      ],
      urgency: "none",
      lastVisit: [0, 5],
    },
  ],
};

export const WISDOM_PACK: ServicePack = {
  service: "WISDOM",
  name: "Wisdom teeth",
  blurb: "Wisdom-teeth consultation and surgery scheduling.",
  caseValue: "$1k–3k",
  callAbout: "having their wisdom teeth checked and taken out",
  offer: "a wisdom-teeth consultation — a panoramic x-ray, an exam, and sedation options explained",
  appointment: "a wisdom-teeth consultation",
  adOffer: "Wisdom teeth consultation — sedation options",
  rubric: WISDOM_RUBRIC_V1,
  persona: WISDOM_PERSONA,
};
