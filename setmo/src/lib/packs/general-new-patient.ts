import type { ServicePack, Rubric } from "@/lib/packs/types";
import type { PersonaSpec } from "@/lib/realism/sampler";

// ---------------------------------------------------------------------------
// New patient (general dentistry).
//
// The highest-volume call in dentistry and the core of call-center work: someone
// who has never been to this practice wants a first visit, and usually opens
// with insurance or price. The setter's job is to get the right visit on the
// books with enough information to make it real — not to quote treatment.
// ---------------------------------------------------------------------------

export const GENERAL_NP_RUBRIC_V1: Rubric = {
  id: "general_np.v1",
  family: "general_np",
  bookedDefinition:
    "The caller accepted a specific date and time for the right first visit (new-patient exam, a child's first visit, or a limited exam for a specific problem), the practice has a name and callback number, and a guardian is attending if the patient is a minor.",
  skills: [
    { key: "rapport", name: "Rapport & warmth", short: "Rapport", tier: "universal", guide: "genuine human connection, warm tone, put the lead at ease." },
    { key: "listening", name: "Listening & empathy", short: "Listening", tier: "universal", guide: "active listening, reflected the lead's words/feelings, didn't talk over." },
    {
      key: "np_visit_triage",
      name: "Right visit for the person",
      short: "Visit fit",
      tier: "service_specific",
      guide:
        "established who the patient is and their age, whether they're new or returning, how long since their last visit, and any current pain or problem — then matched them to the right first visit (full new-patient exam, a child's visit, or a limited exam for a specific problem) instead of defaulting everyone to a cleaning. Screened for anything urgent.",
    },
    {
      key: "np_coverage_clarity",
      name: "Insurance & cost clarity",
      short: "Coverage",
      tier: "service_specific",
      guide:
        "answered the opening insurance or price question inside the first couple of turns, named the plan type and whether the practice is in network, gave the visit fee when the practice publishes one and said honestly that it will be confirmed when it doesn't, and offered a path for someone with no coverage. Never guaranteed what insurance would pay.",
    },
    { key: "objection", name: "Objection handling", short: "Objection", tier: "universal", guide: "addressed concerns (price, fear, spouse, timing) without being pushy." },
    { key: "confidence", name: "Confidence & leadership", short: "Confidence", tier: "universal", guide: "led the call with calm, assured authority." },
    {
      key: "np_first_visit_framing",
      name: "First-visit framing",
      short: "First visit",
      tier: "service_specific",
      guide:
        "set out what the first visit actually includes and how long it takes, tied it to the caller's own reason for calling, was warm and non-judgmental about a long gap or embarrassment, and covered what to bring and who comes along.",
    },
    { key: "closing", name: "Closing the appt", short: "Closing", tier: "universal", guide: "clearly asked for and secured a booked appointment." },
  ],
};

// Every storyline is tagged with the ages and callers it makes sense for, so the
// sampler can only ever combine a story with a person it fits.
export const GENERAL_NP_PERSONA: PersonaSpec = {
  patientAge: [2, 92],
  callerMix: [
    { role: "SELF", weight: 60 },
    { role: "PARENT", weight: 25 },
    { role: "SPOUSE", weight: 6 },
    { role: "ADULT_CHILD", weight: 6 },
    { role: "GUARDIAN", weight: 2 },
    { role: "CAREGIVER", weight: 1 },
  ],
  tones: [
    "friendly and organised",
    "rushed, calling between things",
    "guarded about cost",
    "embarrassed about how long it's been",
    "matter-of-fact",
    "anxious about the dentist",
    "chatty but non-committal",
  ],
  coverages: [
    { key: "PPO", weight: 42 },
    { key: "UNINSURED", weight: 22 },
    { key: "DHMO", weight: 12 },
    { key: "MEDICAID", weight: 10 },
    { key: "MEDICARE_ADVANTAGE", weight: 7 },
    { key: "CHIP", weight: 4 },
    { key: "MEDICARE_ONLY", weight: 3 },
  ],
  archetypes: [
    {
      key: "relocated_adult",
      weight: 16,
      patientAge: [22, 70],
      callerRoles: ["SELF", "SPOUSE"],
      dentition: ["full_natural", "some_missing"],
      situations: [
        "just moved to the area and wants to keep up their six-month cleanings",
        "their old dentist is an hour away now and they've been putting off finding someone",
        "their practice was sold and the new owners feel like a different place",
      ],
      drivers: [
        "they've always kept up with their teeth and don't want to break the streak",
        "a filling feels rough and they want someone to look before it turns into something",
        "they want a dentist established before anything goes wrong",
      ],
      objections: [
        { text: "wants the new-patient forms emailed before committing", difficulty: "WARM" },
        { text: "only free early mornings before work", difficulty: "ADAPTIVE" },
        { text: "wants to be sure the practice is in network before booking", difficulty: "TOUGH" },
      ],
      urgency: "none",
      lastVisit: [0, 2],
    },
    {
      key: "family_block",
      weight: 14,
      patientAge: [3, 15],
      callerRoles: ["PARENT", "GUARDIAN"],
      dentition: ["primary_child", "mixed_child", "full_natural"],
      situations: [
        "wants the whole family seen, starting with the youngest who has a dark spot on a back tooth",
        "new insurance starts the first of the month and the kids are due",
        "the school sent a note home about a dental check",
      ],
      drivers: [
        "they had a lot of dental work as a kid and don't want that for their children",
        "they're worried the spot is a cavity but don't want to scare the child",
        "getting everyone in on one trip is the only way it happens",
      ],
      objections: [
        { text: "wants all the kids in the same visit or it won't work", difficulty: "WARM" },
        { text: "can only do after school, which fills up fast", difficulty: "ADAPTIVE" },
        { text: "asks whether the practice takes the state plan before anything else", difficulty: "TOUGH" },
      ],
      urgency: "soon",
      lastVisit: [0, 3],
    },
    {
      key: "lapsed_embarrassed",
      weight: 15,
      patientAge: [26, 68],
      callerRoles: ["SELF", "SPOUSE"],
      dentition: ["full_natural", "some_missing", "partial_denture"],
      situations: [
        "hasn't seen a dentist in years and knows there's work to be done",
        "lost dental coverage a while back and stopped going",
        "a tooth chipped and it finally pushed them to call",
      ],
      drivers: [
        "they're embarrassed and expect to be lectured",
        "a photo at a family event made them notice their teeth",
        "they're dating again and self-conscious about their smile",
      ],
      objections: [
        { text: "wants to know if they'll be judged for the gap in visits", difficulty: "WARM" },
        { text: "worried a cheap exam turns into a huge treatment plan", difficulty: "ADAPTIVE" },
        { text: "asks for a price on everything before they'll come in", difficulty: "TOUGH" },
      ],
      urgency: "soon",
      lastVisit: [4, 15],
    },
    {
      key: "insurance_shopper",
      weight: 14,
      patientAge: [24, 64],
      callerRoles: ["SELF", "SPOUSE"],
      dentition: ["full_natural", "some_missing"],
      coverage: ["PPO", "DHMO", "MEDICAID"],
      situations: [
        "started a new job and wants to use the dental plan that just kicked in",
        "is calling several offices to find one that takes their plan",
        "their plan changed at renewal and their old office is out of network now",
      ],
      drivers: [
        "they don't want a surprise bill like last time",
        "they have benefits they'll lose at the end of the year",
        "they want the cleaning to be the covered kind, not an upgrade",
      ],
      objections: [
        { text: "asks whether the practice is in network before anything else", difficulty: "WARM" },
        { text: "wants the exact out-of-pocket for a cleaning", difficulty: "ADAPTIVE" },
        { text: "says another office quoted a cheaper new-patient special", difficulty: "TOUGH" },
      ],
      urgency: "none",
      lastVisit: [1, 4],
    },
    {
      key: "uninsured_special",
      weight: 10,
      patientAge: [21, 62],
      callerRoles: ["SELF"],
      dentition: ["full_natural", "some_missing"],
      coverage: ["UNINSURED"],
      situations: [
        "saw a new-patient special advertised and wants to know what it includes",
        "is self-employed with no dental coverage and pays cash",
        "wants a cleaning but is worried about what it'll cost without insurance",
      ],
      drivers: [
        "money is tight and they need to know the number before they commit",
        "they've been told they need work and want a second opinion on price",
        "they want to start somewhere small and build up",
      ],
      objections: [
        { text: "wants the total cost in dollars before booking", difficulty: "ADAPTIVE" },
        { text: "asks whether x-rays are extra on top of the special", difficulty: "ADAPTIVE" },
        { text: "says they'll call around and get back to you", difficulty: "TOUGH" },
      ],
      urgency: "none",
      lastVisit: [2, 10],
    },
    {
      key: "non_emergency_pain",
      weight: 12,
      patientAge: [18, 78],
      callerRoles: ["SELF", "SPOUSE", "ADULT_CHILD"],
      dentition: ["full_natural", "some_missing", "partial_denture"],
      situations: [
        "a back tooth aches on cold drinks but there's no swelling",
        "a filling came out a couple of weeks ago and nothing hurts yet",
        "their gums bleed when they brush and they want it looked at",
      ],
      drivers: [
        "they're afraid it's going to turn into a root canal",
        "they want it dealt with before a trip",
        "they've been living with it and finally admitted it isn't going away",
      ],
      objections: [
        { text: "asks if they can just be seen for the one tooth", difficulty: "WARM" },
        { text: "wants to know if it will be fixed at the first visit", difficulty: "ADAPTIVE" },
        { text: "will only come in if it can be done this week", difficulty: "TOUGH" },
      ],
      urgency: "soon",
      lastVisit: [1, 8],
    },
    {
      key: "senior_transition",
      weight: 9,
      patientAge: [65, 92],
      callerRoles: ["SELF", "ADULT_CHILD", "CAREGIVER", "SPOUSE"],
      dentition: ["some_missing", "partial_denture", "full_upper_denture", "full_dentures"],
      coverage: ["MEDICARE_ADVANTAGE", "MEDICARE_ONLY", "PPO", "UNINSURED"],
      situations: [
        "just retired and is working out what their new plan covers",
        "moved closer to family and needs a dentist near their new home",
        "their partial doesn't sit right since they lost weight",
      ],
      drivers: [
        "they don't want to be a burden about it",
        "eating has become uncomfortable and they've stopped saying so",
        "they want to keep the teeth they still have",
      ],
      objections: [
        { text: "believes their plan covers everything at any dentist", difficulty: "ADAPTIVE" },
        { text: "needs an appointment that fits around a ride from family", difficulty: "ADAPTIVE" },
        { text: "is sure dental isn't covered at all and nearly hangs up", difficulty: "TOUGH" },
      ],
      urgency: "none",
      lastVisit: [1, 6],
    },
    {
      key: "first_time_adult",
      weight: 10,
      patientAge: [18, 34],
      callerRoles: ["SELF", "PARENT"],
      dentition: ["full_natural"],
      situations: [
        "is booking their own dental appointment for the first time now they're off a parent's plan",
        "aged off their parents' insurance and is starting fresh",
        "has never been to a dentist as an adult and doesn't know what to ask for",
      ],
      drivers: [
        "they don't want to look like they don't know how this works",
        "a friend's dental bill scared them into going",
        "they want a clean start before starting a new job",
      ],
      objections: [
        { text: "isn't sure what kind of appointment to even ask for", difficulty: "WARM" },
        { text: "wants to know how long it takes so they can fit it around work", difficulty: "WARM" },
        { text: "is nervous and half-looking for a reason to postpone", difficulty: "TOUGH" },
      ],
      urgency: "none",
      neverVisited: true,
      lastVisit: [0, 0],
    },
  ],
};

export const GENERAL_NEW_PATIENT_PACK: ServicePack = {
  service: "GENERAL",
  name: "New patients & hygiene",
  blurb: "New-patient and recall booking fundamentals — the highest-volume call.",
  caseValue: "$300–450 first visit",
  callAbout: "becoming a new patient at the practice",
  rubric: GENERAL_NP_RUBRIC_V1,
  persona: GENERAL_NP_PERSONA,
};
