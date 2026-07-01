// Shared realistic call content for the demo seeds, so a seeded scored call opens
// with a full transcript + coaching (like a real assessment) instead of a bare
// scorecard. Kept generic (implant appointment-setting) so it reads well anywhere.

export const DEMO_WINS = [
  "Opened warm and personable — built rapport fast",
  "Acknowledged the fear of the procedure before steering to the appointment",
  "Stayed calm and confident when the cost came up",
];

export const DEMO_MISSES = [
  "Quoted the price before framing the value of the outcome",
  "Didn't fully explore why they'd put the implant off for so long",
  "Left the close open-ended instead of offering two specific times",
];

export const DEMO_PHRASES: { from: string; to: string }[] = [
  { from: "It's about twenty grand for the full arch.", to: "Most patients invest in the range we'll go over on the consult — and we have financing that brings it down to a comfortable monthly. Want me to note that so the doctor can walk you through options?" },
  { from: "Okay, well, let me know if you'd like to come in.", to: "I've got Tuesday at 2:00 or Thursday at 10:00 for your free consult and 3D scan — which one works better for you?" },
  { from: "Um, I'm not totally sure how the whole thing works.", to: "Great question — let me walk you through exactly what happens at the first visit so there are no surprises." },
];

export const DEMO_NEXT_SCENARIO =
  "A price-driven, guarded caller who compares you to a cheaper clinic across town — practice framing value before the number and holding your rate.";

// Setter = "you" (ElevenLabs role "user"); AI lead/patient = role "agent".
const TURNS: { who: "lead" | "you"; text: string }[] = [
  { who: "lead", text: "Hi, yeah — I filled out the form online about the dental implants? Just kind of looking into it." },
  { who: "you", text: "Hi Karen, thanks so much for reaching out! My name's Sam — I help folks here get the info they need before anything else. I'd love to hear what's got you thinking about implants now?" },
  { who: "lead", text: "Well, I've had a bridge for years and it's just never felt right. But honestly I've been putting it off — it seems really expensive and kind of scary." },
  { who: "you", text: "That makes total sense, and you're not alone — a lot of our patients felt the exact same way before they came in. When you say it's never felt right, what bothers you most day to day?" },
  { who: "lead", text: "Eating, mostly. I avoid a lot of foods. And it clicks when I talk sometimes, it's embarrassing." },
  { who: "you", text: "That's exactly the kind of thing implants fix — they're solid, they feel like your own teeth, no clicking. Can I ask, how long have you been dealing with that?" },
  { who: "lead", text: "Oh, gosh… probably four or five years now. So what does something like this even cost?" },
  { who: "you", text: "It's about twenty grand for the full arch." },
  { who: "lead", text: "Yeah, see, that's a lot. I don't know." },
  { who: "you", text: "I hear you — it's a real investment, and that's exactly why the first visit is free. The doctor does a 3D scan, shows you what's actually possible for your mouth, and we go over financing that makes it manageable monthly. No pressure at all. Would that be helpful to see?" },
  { who: "lead", text: "I mean… yeah, if it's free to just look, I guess that's fair." },
  { who: "you", text: "Perfect. I've got Tuesday at 2:00 or Thursday at 10:00 for your consult and scan — which one works better for you?" },
  { who: "lead", text: "Thursday's probably better for me." },
  { who: "you", text: "Thursday at 10:00 it is — I'll text you a reminder and what to bring. You're going to be really glad you finally looked into this, Karen." },
];

/** Build an ElevenLabs-shaped post-call payload (what getSessionResult reads for
 *  the transcript). Times are spread across the call's duration. */
export function demoTranscriptPayload(durationSec: number) {
  const n = TURNS.length;
  const transcript = TURNS.map((t, i) => ({
    role: t.who === "you" ? "user" : "agent",
    message: t.text,
    time_in_call_secs: Math.max(1, Math.round(((i + 1) / (n + 1)) * durationSec)),
  }));
  return { data: { transcript } };
}
