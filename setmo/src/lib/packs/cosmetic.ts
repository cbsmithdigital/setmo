import type { ServicePack, Rubric } from "@/lib/packs/types";
import type { PersonaSpec } from "@/lib/realism/sampler";
import { SHARED_SKILLS } from "@/lib/packs/shared";

// ---------------------------------------------------------------------------
// Cosmetic & veneers.
//
// Elective, emotional, and almost always paid out of pocket: someone who wants
// to like their smile — for a wedding, a new job, a fresh start — and is half
// afraid of being upsold or ending up with teeth that look fake. The setter's
// job is to draw out the picture they have in mind, make the consultation the
// obvious next step, and talk about the investment without flinching or
// quoting.
// ---------------------------------------------------------------------------

export const COSMETIC_RUBRIC_V1: Rubric = {
  id: "cosmetic.v1",
  family: "cosmetic",
  bookedDefinition: "The caller accepted a specific date and time for a cosmetic consultation (a smile assessment with the dentist).",
  skills: [
    SHARED_SKILLS.rapport,
    SHARED_SKILLS.listening,
    {
      key: "cos_vision",
      name: "Vision casting",
      short: "Vision",
      tier: "service_specific",
      guide:
        "got the caller to describe what bothers them about their smile today, what they want it to look like, and why now (an event, photos, work, a fresh start); painted the outcome back in the caller's own terms — without promising a specific result.",
    },
    {
      key: "cos_options_education",
      name: "Options education",
      short: "Options",
      tier: "service_specific",
      guide:
        "explained the main paths in plain words — whitening, bonding, veneers, straightening first — as possibilities the dentist will recommend at the consultation based on what the caller described; no diagnosing or final prices over the phone, and no pushing someone who asked about whitening toward veneers.",
    },
    SHARED_SKILLS.objection,
    SHARED_SKILLS.confidence,
    {
      key: "cos_investment_framing",
      name: "Investment framing",
      short: "Investment",
      tier: "service_specific",
      guide:
        "handled money for elective work honestly — that insurance usually doesn't pay for cosmetic work, a range only if the practice publishes one, that payment plans or financing exist — and framed the cost against the result and how long it lasts for this caller, with the consultation as the place to get a real plan and price.",
    },
    SHARED_SKILLS.closing,
  ],
};

export const COSMETIC_PERSONA: PersonaSpec = {
  patientAge: [18, 75],
  callerMix: [
    { role: "SELF", weight: 94 },
    { role: "SPOUSE", weight: 6 },
  ],
  tones: [
    "excited and chatty",
    "self-conscious and quiet",
    "busy professional who wants it efficient",
    "skeptical of salesy offices",
    "price-focused",
    "detail-oriented, full of questions",
    "hopeful but nervous",
  ],
  coverages: [
    { key: "PPO", weight: 50 },
    { key: "UNINSURED", weight: 35 },
    { key: "DHMO", weight: 8 },
    { key: "MEDICAID", weight: 4 },
    { key: "MEDICARE_ADVANTAGE", weight: 3 },
  ],
  leadSources: [
    { key: "ig_ad", weight: 25 },
    { key: "fb_ad", weight: 22 },
    { key: "google_form", weight: 20 },
    { key: "website_quiz", weight: 13 },
    { key: "referral", weight: 12 },
    { key: "maps_request", weight: 8 },
  ],
  concerns: [
    { key: "cost", label: "Cost" },
    { key: "insurance", label: "Expects insurance to help" },
    { key: "results", label: "Worried it'll look fake" },
    { key: "fear", label: "Nervous about the procedure" },
    { key: "timing", label: "Timing" },
    { key: "shopping", label: "Comparing offices" },
    { key: "spouse", label: "Partner has to agree" },
    { key: "pressure", label: "Worried about being upsold" },
    { key: "age", label: "Not sure it's worth it at their age" },
    { key: "commit", label: "Just researching" },
  ],
  archetypes: [
    {
      key: "wedding_ready",
      interest: "A smile makeover before a wedding",
      sources: [
        { key: "ig_ad", weight: 35 },
        { key: "fb_ad", weight: 25 },
        { key: "google_form", weight: 25 },
        { key: "referral", weight: 15 },
      ],
      weight: 15,
      patientAge: [22, 55],
      callerRoles: ["SELF"],
      dentition: ["full_natural"],
      situations: [
        "is getting married in six months and wants to love the photos",
        "is in a close friend's wedding party this spring and hates their smile in pictures",
        "has been avoiding engagement photos because of their teeth",
      ],
      drivers: [
        "they've never liked their smile and this is the moment they decided to do something",
        "a gap in their front teeth has bothered them since middle school",
        "they want to feel confident walking down the aisle",
      ],
      objections: [
        { text: "wants to know if it can be done before the date", difficulty: "WARM", concern: "timing" },
        { text: "worried veneers will look fake or too white", difficulty: "ADAPTIVE", concern: "results" },
        { text: "wants a price for veneers on the phone before anything else", difficulty: "TOUGH", concern: "cost" },
      ],
      urgency: "soon",
      lastVisit: [0, 3],
    },
    {
      key: "whitening_plus",
      interest: "Whitening",
      sources: [
        { key: "ig_ad", weight: 30 },
        { key: "fb_ad", weight: 25 },
        { key: "google_form", weight: 25 },
        { key: "maps_request", weight: 20 },
      ],
      weight: 16,
      patientAge: [20, 65],
      callerRoles: ["SELF"],
      dentition: ["full_natural", "some_missing"],
      situations: [
        "tried whitening strips and they barely made a difference",
        "coffee and red wine have stained their teeth over the years",
        "one front tooth is noticeably darker than the others",
      ],
      drivers: [
        "they started a client-facing job and feel judged",
        "they're dating again",
        "they caught themselves on a video call and hated their smile",
      ],
      objections: [
        { text: "only wants whitening and is wary of being sold something bigger", difficulty: "WARM", concern: "pressure" },
        { text: "asks whether insurance covers whitening", difficulty: "ADAPTIVE", concern: "insurance", coverage: ["PPO", "DHMO", "MEDICAID"] },
        { text: "says a spa down the street does whitening for half the price", difficulty: "TOUGH", concern: "shopping" },
      ],
      urgency: "none",
      lastVisit: [0, 4],
    },
    {
      key: "veneers_researcher",
      interest: "Veneers",
      sources: [
        { key: "google_form", weight: 30 },
        { key: "ig_ad", weight: 25 },
        { key: "website_quiz", weight: 25 },
        { key: "referral", weight: 20 },
      ],
      weight: 16,
      patientAge: [24, 60],
      callerRoles: ["SELF"],
      dentition: ["full_natural", "some_missing"],
      situations: [
        "has been watching veneer videos online for months",
        "has small, worn front teeth that make them look older than they are",
        "their teeth are slightly crooked and they want them even without braces",
      ],
      drivers: [
        "they've been self-conscious about their teeth since they were a teenager",
        "they hit a milestone birthday and want to feel good about how they look",
        "they're in sales and their smile is their first impression",
      ],
      objections: [
        { text: "wants to see before-and-after photos of the dentist's own work", difficulty: "WARM", concern: "results" },
        { text: "worried veneers will ruin their natural teeth", difficulty: "ADAPTIVE", concern: "fear" },
        { text: "says a clinic abroad quoted a fraction of the price", difficulty: "TOUGH", concern: "shopping" },
      ],
      urgency: "none",
      lastVisit: [0, 3],
    },
    {
      key: "chipped_front_tooth",
      interest: "Fixing a chipped front tooth",
      sources: [
        { key: "google_form", weight: 35 },
        { key: "maps_request", weight: 30 },
        { key: "voicemail", weight: 20 },
        { key: "referral", weight: 15 },
      ],
      weight: 14,
      patientAge: [18, 70],
      callerRoles: ["SELF", "SPOUSE"],
      dentition: ["full_natural", "some_missing"],
      situations: [
        "chipped a front tooth on a fork last week",
        "old bonding on a front tooth has stained and chipped",
        "broke a corner off a front tooth playing pickleball",
      ],
      drivers: [
        "they have a presentation at work next week",
        "they've stopped smiling at people since it happened",
        "they're worried it'll keep breaking",
      ],
      objections: [
        { text: "asks if it can be fixed in one visit", difficulty: "WARM", concern: "timing" },
        { text: "wants to know if insurance pays since it was an accident", difficulty: "ADAPTIVE", concern: "insurance", coverage: ["PPO", "DHMO", "MEDICAID", "MEDICARE_ADVANTAGE"] },
        { text: "worried it'll turn into a big, expensive job when they just want it patched", difficulty: "TOUGH", concern: "cost" },
      ],
      urgency: "soon",
      lastVisit: [0, 5],
    },
    {
      key: "midlife_refresh",
      interest: "A smile refresh",
      sources: [
        { key: "fb_ad", weight: 35 },
        { key: "google_form", weight: 30 },
        { key: "website_quiz", weight: 20 },
        { key: "referral", weight: 15 },
      ],
      weight: 14,
      patientAge: [40, 72],
      callerRoles: ["SELF"],
      dentition: ["full_natural", "some_missing"],
      situations: [
        "their teeth have yellowed and worn down over the years",
        "old silver fillings and dark crowns show when they laugh",
        "their front teeth have shifted and gotten crowded",
      ],
      drivers: [
        "they've been through a divorce and want a fresh start",
        "their kids are older now and it's finally their turn",
        "they look at old photos and miss their smile",
      ],
      objections: [
        { text: "worried it will take a lot of appointments", difficulty: "WARM", concern: "timing" },
        { text: "needs to talk it over with their partner before spending this kind of money", difficulty: "ADAPTIVE", concern: "spouse" },
        { text: "wonders whether it's worth it at their age", difficulty: "TOUGH", concern: "age" },
      ],
      urgency: "none",
      lastVisit: [0, 6],
    },
    {
      key: "gap_or_crooked",
      interest: "Straighter-looking teeth",
      sources: [
        { key: "ig_ad", weight: 35 },
        { key: "website_quiz", weight: 25 },
        { key: "google_form", weight: 25 },
        { key: "fb_ad", weight: 15 },
      ],
      weight: 13,
      patientAge: [20, 50],
      callerRoles: ["SELF"],
      dentition: ["full_natural"],
      situations: [
        "has a gap between the front teeth they've always hated",
        "their front teeth overlap slightly and it shows in photos",
        "had braces as a teen but the teeth shifted back",
      ],
      drivers: [
        "they never wore their retainer and feel guilty about it",
        "they want to stop hiding their smile on video calls",
        "they're tired of people noticing their teeth first",
      ],
      objections: [
        { text: "asks whether bonding or veneers would be faster than straightening", difficulty: "WARM", concern: "timing" },
        { text: "is just researching and not ready to commit to anything", difficulty: "ADAPTIVE", concern: "commit" },
        { text: "wants a price on the phone and won't come in for a sales pitch", difficulty: "TOUGH", concern: "pressure" },
      ],
      urgency: "none",
      lastVisit: [0, 4],
    },
    {
      key: "redo_old_work",
      interest: "Redoing old cosmetic work",
      sources: [
        { key: "google_form", weight: 35 },
        { key: "referral", weight: 25 },
        { key: "maps_request", weight: 20 },
        { key: "voicemail", weight: 20 },
      ],
      weight: 12,
      patientAge: [30, 70],
      callerRoles: ["SELF"],
      dentition: ["full_natural", "some_missing"],
      situations: [
        "had veneers done years ago and they look bulky now",
        "a crown on a front tooth doesn't match the teeth next to it",
        "the bonding on their front teeth keeps staining",
      ],
      drivers: [
        "they're embarrassed they paid for something they don't like",
        "they want it done right this time",
        "a friend noticed the mismatched tooth and it stung",
      ],
      objections: [
        { text: "wants to know how much experience the dentist has redoing someone else's work", difficulty: "WARM", concern: "results" },
        { text: "worried about paying all over again", difficulty: "ADAPTIVE", concern: "cost" },
        { text: "doesn't trust cosmetic dentists after the last one and wants proof this time will be different", difficulty: "TOUGH", concern: "results" },
      ],
      urgency: "none",
      lastVisit: [0, 3],
    },
  ],
};

export const COSMETIC_PACK: ServicePack = {
  service: "COSMETIC",
  name: "Cosmetic & veneers",
  blurb: "Smile-makeover calls — whitening, bonding and veneers.",
  caseValue: "$8k–30k",
  callAbout: "improving how their smile looks — whitening, bonding or veneers",
  offer: "a cosmetic consultation — the dentist looks at their smile, talks through what's possible and what it would involve",
  appointment: "a cosmetic consultation",
  adOffer: "Smile consultation — see what's possible",
  rubric: COSMETIC_RUBRIC_V1,
  persona: COSMETIC_PERSONA,
};
