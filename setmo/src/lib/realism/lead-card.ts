import type { Rng } from "@/lib/realism/rng";
import { COVERAGE_AS_LISTED, type CallerRole, type CardFacts, type Coverage } from "@/lib/realism/types";

// ---------------------------------------------------------------------------
// The lead card: what a setter would see in their CRM before dialing — who the
// lead is, how they reached the practice, what they wrote, and the call history.
// Never the things the call is meant to test: the real reason they reached out,
// the hesitation they'll raise, or how hard they'll be to win over. Those are
// revealed after the call, next to whether the setter found them.
//
// Every fact on the card is also in the lead's role-play prompt, so the person
// who answers knows what the practice has on file and can't contradict it.
// ---------------------------------------------------------------------------

export type LeadSource = {
  key: string;
  /** How the CRM shows it. */
  label: string;
  /** The heading over their note on the card. */
  noteLabel: string;
  /** Whether their note is something they typed or something they said. */
  noteKind: "form" | "voicemail";
  /** The same fact in the lead's own terms, for their prompt. */
  asLead: string;
  /** Only for leads who listed some coverage (an insurer's directory). */
  needsCoverage?: boolean;
  /** When this kind of lead can have come in (an after-hours voicemail wasn't
   *  left ten minutes ago). Any time when absent. */
  optIn?: string[];
  /** A paid ad — the card shows the offer it ran with. */
  ad?: boolean;
};

export const LEAD_SOURCES: Record<string, LeadSource> = {
  fb_ad: {
    key: "fb_ad",
    label: "Facebook ad → lead form",
    noteLabel: "What they wrote",
    noteKind: "form",
    asLead: "You filled out a short form on one of the practice's Facebook ads",
    ad: true,
  },
  ig_ad: {
    key: "ig_ad",
    label: "Instagram ad → lead form",
    noteLabel: "What they wrote",
    noteKind: "form",
    asLead: "You filled out a short form on one of the practice's Instagram ads",
    ad: true,
  },
  google_form: {
    key: "google_form",
    label: "Google search → website form",
    noteLabel: "What they wrote",
    noteKind: "form",
    asLead: "You searched online, found the practice's website and filled out its contact form",
  },
  maps_request: {
    key: "maps_request",
    label: "Google Maps → appointment request",
    noteLabel: "What they wrote",
    noteKind: "form",
    asLead: "You tapped “request an appointment” on the practice's Google Maps listing and added a short note",
  },
  website_quiz: {
    key: "website_quiz",
    label: "Website → “Am I a candidate?” quiz",
    noteLabel: "What they wrote",
    noteKind: "form",
    asLead: "You took the “Am I a candidate?” quiz on the practice's website and left your number",
    ad: true,
  },
  website_booking: {
    key: "website_booking",
    label: "Website → online booking (not finished)",
    noteLabel: "What they entered",
    noteKind: "form",
    asLead: "You started booking online on the practice's website but didn't finish",
  },
  insurance_voicemail: {
    key: "insurance_voicemail",
    label: "Insurance plan's dentist list → voicemail",
    noteLabel: "Their voicemail",
    noteKind: "voicemail",
    asLead: "You found the practice on your insurance plan's list of dentists and left them a voicemail",
    needsCoverage: true,
  },
  referral: {
    key: "referral",
    label: "Referred by a current patient → web form",
    noteLabel: "What they wrote",
    noteKind: "form",
    asLead: "A friend who goes to the practice told you about it, and you filled out the form on its website",
  },
  voicemail: {
    key: "voicemail",
    label: "Called after hours → voicemail",
    noteLabel: "Their voicemail",
    noteKind: "voicemail",
    asLead: "You called the practice after hours and left a voicemail",
    optIn: ["last night", "this morning", "two days ago", "last week"],
  },
};

/** When they reached out, and how many unanswered attempts that leaves room
 *  for — nobody has two missed calls on a lead that came in ten minutes ago. */
export const OPT_IN: { text: string; weight: number; maxAttempts: 0 | 1 | 2 }[] = [
  { text: "about 10 minutes ago", weight: 18, maxAttempts: 0 },
  { text: "about an hour ago", weight: 14, maxAttempts: 1 },
  { text: "this morning", weight: 16, maxAttempts: 1 },
  { text: "last night", weight: 20, maxAttempts: 1 },
  { text: "yesterday afternoon", weight: 14, maxAttempts: 2 },
  { text: "two days ago", weight: 12, maxAttempts: 2 },
  { text: "last week", weight: 6, maxAttempts: 2 },
];

export function maxAttemptsFor(optedIn: string): 0 | 1 | 2 {
  return OPT_IN.find((o) => o.text === optedIn)?.maxAttempts ?? 2;
}

/** Draw the CRM facts from the sources this lead could plausibly have used. */
export function sampleCardFacts(
  rng: Rng,
  sources: readonly { key: string; weight: number }[],
  opts: { coverage?: Coverage } = {}
): CardFacts {
  const usable = sources.filter((s) => {
    const def = LEAD_SOURCES[s.key];
    if (!def) return false;
    // An insurer's directory only lists the practice to people who are covered.
    return !def.needsCoverage || (opts.coverage != null && opts.coverage !== "UNINSURED" && opts.coverage !== "MEDICARE_ONLY");
  });
  const source = usable.length ? rng.weighted(usable.map((s) => ({ item: s.key, weight: s.weight }))) : "google_form";
  const allowed = LEAD_SOURCES[source]?.optIn;
  const times = allowed ? OPT_IN.filter((o) => allowed.includes(o.text)) : OPT_IN;
  const optIn = rng.weighted(times.map((o) => ({ item: o, weight: o.weight })));
  const attempts = rng.int(0, optIn.maxAttempts) as 0 | 1 | 2;
  return { source, optedIn: optIn.text, attempts };
}

/** Words that plainly give a concern away in the lead's own note — the backstop
 *  behind the model check in note-guard.ts, used when that check can't run.
 *  Kept to words that NAME the hesitation: a note can still say "schedule" or
 *  "form" without giving anything away. */
export const NOTE_GIVEAWAY: Record<string, RegExp> = {
  cost: /\b(cost|costs|costly|price|prices|pricing|expensive|cheap|cheapest|afford\w*|money|budget|financ\w*|payment plan|how much|charge|fees?|out of pocket|discount)\b|\$/i,
  insurance: /\b(insurance|insured|in[- ]network|out of network|coverage|covered|medicaid|medicare|chip|ppo|dhmo|state plan|take my plan|accept my plan|delta|cigna|aetna|metlife|guardian|humana)\b/i,
  schedule: /\b(after school|before work|early mornings?|evenings? only|weekends? only|saturdays?|this week only|time off|same visit|back to back|all (the kids|three|of them) (at once|together))\b/i,
  nerves: /\b(nervous|anxious|anxiety|scared|afraid|terrified|phobia|fear|embarrass\w*|ashamed|judg(ed|ing|ment|e me)|lectur\w*)\b/i,
  shopping: /\b(quote|quotes|quoted|cheaper|lower price|match (it|that|the price)|calling around|shopping around|other (office|offices|dentist|dentists|places)|compar\w*|second opinion)\b/i,
  visit: /\b(just (the|one|that) tooth|fixed (at|on) the first|fix it (at|on) the first|done (at|on) the first|what (kind of )?appointment|which appointment|what to ask for)\b/i,
  commit: /\b(paperwork|new patient (packet|forms)|email (me|them|it)|send (me|it|them) (over|the forms))\b/i,
  fear: /\b(scared|afraid|terrified|phobia|fear|nervous|anxious|surgery|painful procedure|put under|sedat\w*)\b/i,
  spouse: /\b(wife|husband|spouse|partner)\b/i,
  timing: /\b(too busy|time off|later this year|after the holidays|next year|when things calm down|not a good time)\b/i,
  doubt: /\b(really work|actually work|work for me|skeptic\w*|legit|scam|too good to be true)\b/i,
  pressure: /\b(pressure\w*|pushy|sales ?pitch|upsell\w*|hard sell|no strings)\b/i,
  age: /\b(at my age|too old|worth it|my age)\b/i,
};

/** Why a note plainly gives the hesitation away, or null when it doesn't. */
export function noteGivesConcernAway(note: string | null | undefined, concern: string | null | undefined): string | null {
  if (!note || !concern) return null;
  const hit = NOTE_GIVEAWAY[concern]?.exec(note);
  return hit ? `the note mentions "${hit[0]}", which gives away their hesitation (${concern}) — leave that out, the setter has to uncover it on the call` : null;
}

/** A plain note in the lead's own voice — the fallback when a written one gives
 *  something away. Says nothing about any hesitation. */
export function plainNote(opts: { noteKind: "form" | "voicemail"; forName?: string | null; newPatient?: boolean }): string {
  const about = opts.forName
    ? `getting ${opts.forName} in${opts.newPatient ? " as a new patient" : ""}`
    : opts.newPatient
      ? "coming in as a new patient"
      : "my options";
  return opts.noteKind === "voicemail"
    ? `Hi, I'm calling about ${about}. Please give me a call back.`
    : `Hi, I'd like to talk about ${about}. Please call me.`;
}

export function attemptsLabel(attempts: number, callback = false): string {
  if (callback) return "Spoke a few minutes ago — the call dropped";
  if (attempts <= 0) return "First call";
  if (attempts === 1) return "1 earlier call — no answer";
  return "2 earlier calls — no answer · 1 text sent";
}

/** The CRM facts, as the lead knows them, for the role-play prompt. */
export function onFileBlock(opts: {
  card: CardFacts;
  note?: string | null;
  coverage?: Coverage | null;
  interest?: string | null;
}): string {
  const src = LEAD_SOURCES[opts.card.source] ?? LEAD_SOURCES.google_form;
  const lines = [`- ${src.asLead} ${opts.card.optedIn}.`];
  if (opts.note) {
    lines.push(src.noteKind === "voicemail" ? `- In the voicemail you said: "${opts.note}"` : `- What you wrote: "${opts.note}"`);
  }
  if (opts.interest) lines.push(`- The practice has you down as interested in: ${opts.interest.toLowerCase()}.`);
  if (opts.coverage) lines.push(`- For insurance you put down: ${COVERAGE_AS_LISTED[opts.coverage]}.`);
  lines.push(
    opts.card.callback
      ? "- You were on the phone with them a few minutes ago and the line cut out; they're calling you back. You remember the call had started — let them lead."
      : opts.card.attempts === 0
        ? "- This is the first time they've called you."
        : opts.card.attempts === 1
          ? "- They called you once before and you missed it."
          : "- They've called you twice and sent a text; you didn't get back to them."
  );
  return [
    "WHAT THE PRACTICE HAS ON FILE (the setter may be looking at this)",
    ...lines,
    "Don't act surprised that they know these things, and never contradict them.",
  ].join("\n");
}

/** A copy of a stored lead marked as a callback (same person, the call dropped),
 *  for both lead shapes. Leads without a card come back unchanged. */
export function markCallback(seed: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(seed);
  const skeleton = copy.skeleton as { card?: CardFacts } | undefined;
  if (skeleton?.card) skeleton.card.callback = true;
  else if (copy.card) (copy.card as CardFacts).callback = true;
  return copy;
}

// ---------------------------------------------------------------------------
// Reading a stored lead back for the screens. Two shapes exist: the implant
// generator's persona and the lead engine's skeleton + prose.
// ---------------------------------------------------------------------------

export type LeadCard = {
  name: string;
  age: number | null;
  /** "Calling about her son Mateo, 9" — null when they're calling for themselves. */
  forWhom: string | null;
  source: string;
  /** Came in through a paid ad, so the card can show the offer it ran with. */
  fromAd: boolean;
  optedIn: string;
  attempts: string;
  noteLabel: string;
  note: string | null;
  interest: string | null;
  insurance: string | null;
};

export type LeadReveal = {
  name: string;
  age: number | null;
  forWhom: string | null;
  situation: string;
  realReason: string;
  hesitation: string;
  tone: string;
  difficulty: string | null;
  choice: string | null;
};

type StoredSkeleton = {
  caller: { firstName: string; lastName: string; age: number; gender: "male" | "female"; role: CallerRole };
  patient: { firstName: string; age: number; gender: "male" | "female"; relation: string };
  coverage: Coverage;
  situation: string;
  hiddenWhy: string;
  objection: string;
  tone: string;
  interest?: string;
  card?: CardFacts;
};
type StoredProse = { background?: string; hiddenWhyInTheirWords?: string; objectionInTheirWords?: string; formNote?: string };
type StoredImplant = {
  name?: string;
  age?: string;
  background?: string;
  hiddenWhy?: string;
  primaryObjection?: string;
  emotionalTone?: string;
  painLevel?: string;
  formNote?: string;
  interest?: string;
  card?: CardFacts;
};

const DIFFICULTY_LABEL: Record<string, string> = { WARM: "Warm lead", ADAPTIVE: "Balanced", TOUGH: "Tough lead" };

/** "Calling about her son Mateo, 9" — who the appointment is for, in the words
 *  a front desk would use. Null when they're calling about themselves. */
function forWhomOf(s: StoredSkeleton): string | null {
  if (s.caller.role === "SELF") return null;
  const her = s.caller.gender === "female" ? "her" : "his";
  const she = s.caller.gender === "female" ? "she" : "he";
  const female = s.patient.gender === "female";
  const who = `${s.patient.firstName}, ${s.patient.age}`;
  switch (s.caller.role) {
    case "PARENT":
      return `Calling about ${her} ${female ? "daughter" : "son"} ${who}`;
    case "GRANDPARENT":
      return `Calling about ${her} ${female ? "granddaughter" : "grandson"} ${who}`;
    case "SPOUSE":
      return `Calling about ${her} ${female ? "wife" : "husband"} ${who}`;
    case "ADULT_CHILD":
      return `Calling about ${her} ${female ? "mother" : "father"} ${who}`;
    case "GUARDIAN":
      return `Calling about ${who} — the child ${she} looks after`;
    case "CAREGIVER":
      return `Calling about ${who} — the ${female ? "woman" : "man"} ${she} cares for`;
  }
}

/** An implant lead's age as a number — only when it was stored as one. Older
 *  leads stored a range ("late 40s"), which has no single age to show. */
function implantAge(age: string | undefined): number | null {
  if (!age || !/^\d{1,3}$/.test(age.trim())) return null;
  return Number(age.trim());
}

function choiceLabel(seed: Record<string, unknown>): string | null {
  const c = seed.choiceLabel;
  return typeof c === "string" && c ? c : null;
}

/** The card for a stored lead, or null when the lead predates the card. */
export function leadCardFromSeed(seed: Record<string, unknown> | null | undefined): LeadCard | null {
  if (!seed) return null;
  const skeleton = seed.skeleton as StoredSkeleton | undefined;
  if (skeleton) {
    if (!skeleton.card) return null;
    const prose = (seed.prose ?? {}) as StoredProse;
    const src = LEAD_SOURCES[skeleton.card.source] ?? LEAD_SOURCES.google_form;
    return {
      name: `${skeleton.caller.firstName} ${skeleton.caller.lastName}`,
      age: skeleton.caller.age,
      forWhom: forWhomOf(skeleton),
      source: src.label,
      fromAd: Boolean(src.ad),
      optedIn: skeleton.card.optedIn,
      attempts: attemptsLabel(skeleton.card.attempts, skeleton.card.callback),
      noteLabel: src.noteLabel,
      note: prose.formNote ?? null,
      interest: skeleton.interest ?? null,
      insurance: COVERAGE_AS_LISTED[skeleton.coverage] ?? null,
    };
  }
  const p = seed as StoredImplant;
  if (!p.name || !p.card) return null;
  const src = LEAD_SOURCES[p.card.source] ?? LEAD_SOURCES.google_form;
  return {
    name: p.name,
    age: implantAge(p.age),
    forWhom: null,
    source: src.label,
    fromAd: Boolean(src.ad),
    optedIn: p.card.optedIn,
    attempts: attemptsLabel(p.card.attempts, p.card.callback),
    noteLabel: src.noteLabel,
    note: p.formNote ?? null,
    interest: p.interest ?? null,
    insurance: null,
  };
}

/** Everything about the lead, for after the call. Null for calls with no
 *  composed lead (live calls, seeded demo history). */
export function leadRevealFromSeed(seed: Record<string, unknown> | null | undefined): LeadReveal | null {
  if (!seed || seed.hidden === true || seed.demoSeed === true) return null;
  const difficulty = typeof seed.resolvedDifficulty === "string" ? DIFFICULTY_LABEL[seed.resolvedDifficulty] ?? null : null;
  const skeleton = seed.skeleton as StoredSkeleton | undefined;
  if (skeleton) {
    const prose = (seed.prose ?? {}) as StoredProse;
    return {
      name: `${skeleton.caller.firstName} ${skeleton.caller.lastName}`,
      age: skeleton.caller.age,
      forWhom: forWhomOf(skeleton),
      situation: prose.background ?? skeleton.situation,
      realReason: prose.hiddenWhyInTheirWords ?? skeleton.hiddenWhy,
      hesitation: prose.objectionInTheirWords ?? skeleton.objection,
      tone: skeleton.tone,
      difficulty,
      choice: choiceLabel(seed),
    };
  }
  const p = seed as StoredImplant;
  if (!p.name || !p.hiddenWhy) return null;
  return {
    name: p.name,
    age: implantAge(p.age),
    forWhom: null,
    situation: p.background ?? "",
    realReason: p.hiddenWhy,
    hesitation: p.primaryObjection ?? "",
    tone: [p.emotionalTone, p.painLevel ? `${p.painLevel} pain` : null].filter(Boolean).join(" · "),
    difficulty,
    choice: choiceLabel(seed),
  };
}
