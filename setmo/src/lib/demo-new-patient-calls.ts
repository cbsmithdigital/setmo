import type { DemoCall } from "@/lib/demo-content";

// Seeded new-patient calls for demo accounts, scored on the New patient rubric
// (general_np.v1). Same shape as the implant call library so the demo builder
// treats them alike. Skill scores are set per call so the results page tells the
// same story as the coaching text.

export type DemoNewPatientCall = DemoCall & { skills: Record<string, number> };

export const NEW_PATIENT_CALLS: DemoNewPatientCall[] = [
  {
    persona: "Insurance shopper, burned by a surprise bill before",
    band: "high",
    booked: true,
    narrative: "You answered the insurance question inside two turns, turned her surprise-bill fear into a reason to trust you, and locked a specific time with everything she needs to bring.",
    wins: [
      "Answered 'do you take my plan' straight away and explained you'd verify benefits before the visit — exactly the reassurance she was calling for.",
      "When she mentioned the surprise bill, you slowed down, named it, and walked her through how the practice prevents that — she relaxed audibly.",
      "Offered two specific times and captured name, callback number and date of birth for the insurance check before hanging up.",
    ],
    misses: [
      "You never asked whether anything was bothering her right now — a quick pain check would have confirmed a routine new-patient exam was the right visit.",
      "Didn't confirm she was new to the practice before booking the new-patient slot.",
    ],
    phrases: [
      { from: "We take most PPOs.", to: "We're in network with most PPOs, and I'll verify yours before you come in so there are no surprises." },
      { from: "Does Thursday work?", to: "I have Tuesday at 10 or Thursday at 2 — which fits better?" },
    ],
    nextScenario: "An uninsured caller who wants a price for 'just a cleaning' before they'll book.",
    transcript: [
      { who: "lead", text: "Hi, I'm calling to see if you take my dental insurance. It's a PPO through my job." },
      { who: "you", text: "Happy to help with that. Who am I speaking with?" },
      { who: "lead", text: "It's Sandra. I just moved here and I haven't been to a dentist in about four years." },
      { who: "you", text: "Welcome to the area, Sandra. We're in network with most PPOs, and before your visit I'll verify your exact benefits so you know what's covered. Four years is really common, by the way — no one's going to lecture you." },
      { who: "lead", text: "Okay, good. Honestly, the last place I went, I thought I was covered and then I got this huge bill afterwards." },
      { who: "you", text: "That's so frustrating, and it's exactly what we try to prevent. We check your plan ahead of time, and if anything isn't covered the doctor talks it through with you before anything's done. You'll never be surprised at the front desk." },
      { who: "lead", text: "That's really all I want. What would the first visit be?" },
      { who: "you", text: "It's a new-patient exam — the doctor looks at everything, you get x-rays and a cleaning. It takes about an hour. With an in-network PPO the exam and x-rays are usually covered, and I'll confirm your cleaning coverage when I verify." },
      { who: "lead", text: "Okay. What do you have?" },
      { who: "you", text: "I have Tuesday at 10 or Thursday at 2 — which fits better?" },
      { who: "lead", text: "Thursday at two works." },
      { who: "you", text: "Perfect, you're booked Thursday at 2. Can I get your best callback number and your date of birth so I can check your plan? And bring your insurance card and a photo ID." },
      { who: "lead", text: "Sure. And thank you — you were really straightforward about all of it." },
    ],
    skills: { rapport: 4.6, listening: 4.4, np_visit_triage: 3.2, np_coverage_clarity: 4.7, objection: 4.5, confidence: 4.4, np_first_visit_framing: 4.2, closing: 4.6 },
  },
  {
    persona: "Parent booking three kids after a school note",
    band: "mid",
    booked: true,
    narrative: "You got all three kids booked in one visit, which is what she needed — but you rushed past the dark spot on her daughter's tooth and never checked whether it hurt.",
    wins: [
      "Offered to see all three children in back-to-back slots so it's one trip — the thing that decides whether a busy parent books at all.",
      "Confirmed which parent holds the insurance and that a parent will be there for every child.",
    ],
    misses: [
      "She mentioned a dark spot on Maya's tooth and you moved straight on. Ask whether it hurts or bothers her — that changes how the visit is set up.",
      "Didn't explain what a first visit looks like for the youngest, which is usually what a parent is quietly worried about.",
      "Talked through the insurance at length before finding out whether after-school times were even possible.",
    ],
    phrases: [
      { from: "Okay, so three kids.", to: "Three kids — let's get them all in on the same afternoon so it's one trip for you." },
      { from: "We'll take a look at the spot.", to: "Is that spot bothering her at all when she eats or drinks something cold? That helps me set the visit up right." },
    ],
    nextScenario: "A parent whose child has had a bad dental experience and is scared to come back.",
    transcript: [
      { who: "lead", text: "Hi, I need to get my kids in. The school sent home a note that they need a dental check." },
      { who: "you", text: "Sure, I can help. How many kids and how old are they?" },
      { who: "lead", text: "Three. Ethan is nine, Maya is six, and Leo just turned four. Maya has a dark spot on one of her back teeth too." },
      { who: "you", text: "Okay. And what insurance are they on?" },
      { who: "lead", text: "They're on my husband's plan through his work. I think it's a PPO." },
      { who: "you", text: "That's fine, we'll verify it. We'd need the subscriber's name and date of birth, and the member ID from the card." },
      { who: "lead", text: "I can get that. The problem is I work until three, so it has to be after school." },
      { who: "you", text: "Got it. I can put all three back to back on Wednesday starting at 3:30, so it's one trip." },
      { who: "lead", text: "Oh, that would actually be great. Can I be in the room with them?" },
      { who: "you", text: "Absolutely, and a parent needs to be there anyway. So Wednesday at 3:30 for all three?" },
      { who: "lead", text: "Yes, let's do that." },
      { who: "you", text: "You're all set. Just bring the insurance card and we'll see you Wednesday." },
    ],
    skills: { rapport: 3.9, listening: 3.3, np_visit_triage: 2.8, np_coverage_clarity: 3.9, objection: 3.8, confidence: 3.9, np_first_visit_framing: 3.1, closing: 4.2 },
  },
  {
    persona: "Uninsured caller who just wants the price of a cleaning",
    band: "low",
    booked: false,
    narrative: "He asked for a price and you gave him one — then he said he'd call around, and you let him go without ever finding out why he called or what the visit would actually include.",
    wins: [
      "Stayed polite and didn't get defensive when he pushed on price.",
    ],
    misses: [
      "Quoted a number before learning anything about him — nine years since a visit and bleeding gums probably means this isn't 'just a cleaning', and he should hear that from you before he shops on price.",
      "Never explained what a first visit includes, so the only thing he could compare was the number.",
      "When he said he'd call around, you didn't offer a time or any reason to book with you today.",
    ],
    phrases: [
      { from: "A cleaning is about ninety-nine dollars.", to: "Before I give you a number — when was your last visit? That tells me which visit you actually need, so the price I give you is real." },
      { from: "Okay, feel free to call back.", to: "I'd hate for you to pay for a cleaning somewhere and then find out you needed an exam first. I have an opening Friday at 9 — want me to hold it while you decide?" },
    ],
    nextScenario: "The same price shopper, but try to get the story behind the call before you ever quote a number.",
    transcript: [
      { who: "lead", text: "Yeah, how much is a cleaning? I don't have insurance." },
      { who: "you", text: "A regular cleaning is around ninety-nine dollars for self-pay." },
      { who: "lead", text: "Okay. And that's everything?" },
      { who: "you", text: "Well, if you're a new patient there's also the exam and x-rays." },
      { who: "lead", text: "So how much is all of it?" },
      { who: "you", text: "It depends on what the doctor finds, but the exam and x-rays are usually around two hundred." },
      { who: "lead", text: "Hmm. It's been like nine years, and my gums bleed a bit, but I really just want a cleaning." },
      { who: "you", text: "Okay, we can definitely do a cleaning for you." },
      { who: "lead", text: "Alright. I'm going to call around and see what other places charge." },
      { who: "you", text: "Sure, no problem. Feel free to call us back." },
    ],
    skills: { rapport: 2.9, listening: 2.4, np_visit_triage: 1.8, np_coverage_clarity: 2.6, objection: 2.0, confidence: 2.7, np_first_visit_framing: 1.9, closing: 1.6 },
  },
];
