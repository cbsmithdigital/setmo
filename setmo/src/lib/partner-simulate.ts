import { prisma } from "@/lib/db";
import { rubricForService } from "@/lib/packs/registry";
import { emitSessionEvent } from "@/lib/partner-webhooks";

// ===========================================================================
// Test mode only: run a partner call's whole life in about ten seconds, with a
// made-up conversation and score — no voice call, no microphone, no model
// calls. It lets the partner's developers build the webhook side (started →
// ended → completed, or a failure) before anyone talks to a lead.
//
// A simulated call is marked in its lead data (simulated: true), stays in the
// partner's test locations, and uses test tokens like a real call so the
// wallet numbers behave the same. It never touches coaching memory,
// recommendations or leaderboards.
// ===========================================================================

export type SimulatedOutcome = "completed" | "too_short" | "no_transcript";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LEAD = {
  name: "Linda Hayes",
  age: "62",
  background: "Lost two lower teeth last year and has worn a partial she hates; her daughter is getting married in the spring.",
  hiddenWhy: "She stopped smiling in photos and doesn't want to hide in her daughter's wedding pictures.",
  primaryObjection: "She's worried it will cost more than she can put on a card right now.",
  emotionalTone: "warm but guarded",
};

const TRANSCRIPT = [
  { role: "agent", message: "Hello?", time_in_call_secs: 0 },
  { role: "user", message: "Hi, is this Linda? This is the front desk calling back about the form you filled out.", time_in_call_secs: 3 },
  { role: "agent", message: "Oh, yes. I wasn't sure anyone would call.", time_in_call_secs: 9 },
  { role: "user", message: "I'm glad I caught you. What made you reach out?", time_in_call_secs: 14 },
  { role: "agent", message: "My partial is driving me crazy, and I've got a wedding coming up.", time_in_call_secs: 20 },
  { role: "user", message: "Congratulations! Tell me more about the wedding — is it someone close to you?", time_in_call_secs: 27 },
  { role: "agent", message: "My daughter's. I just don't want to be hiding my smile in every picture.", time_in_call_secs: 34 },
  { role: "user", message: "That makes complete sense. Let's get you in for a consultation so the doctor can show you your options and the cost up front.", time_in_call_secs: 45 },
  { role: "agent", message: "I'm worried about the cost, honestly.", time_in_call_secs: 56 },
  { role: "user", message: "That's fair. The consult is free, and we'll walk through financing so you know the monthly number before you decide anything.", time_in_call_secs: 63 },
  { role: "agent", message: "Okay. Do you have anything next week?", time_in_call_secs: 75 },
  { role: "user", message: "I have Tuesday at 10 or Thursday at 2. Which works better?", time_in_call_secs: 80 },
  { role: "agent", message: "Thursday at 2.", time_in_call_secs: 86 },
];

const SCORES = [4.2, 3.6, 3.1, 4.0, 2.8, 3.5, 3.9, 3.2];

/** Start the simulation. Returns an error message if the call can't be simulated. */
export async function startSimulation(sessionId: string): Promise<string | null> {
  const s = await prisma.session.findUnique({ where: { id: sessionId }, select: { status: true, partnerMode: true, personaSeed: true } });
  if (!s || s.partnerMode !== "TEST") return "Only test-mode sessions can be simulated.";
  if (s.status !== "CREATED") return "This session has already started — create a new one to simulate.";
  const seed = (s.personaSeed ?? {}) as Record<string, unknown>;
  const claimed = await prisma.session.updateMany({
    where: { id: sessionId, status: "CREATED" },
    data: { status: "IN_PROGRESS", startedAt: new Date(), personaSeed: { ...seed, ...LEAD, hidden: false, simulated: true } as object },
  });
  return claimed.count === 1 ? null : "This session has already started — create a new one to simulate.";
}

/** The rest of the simulated call: connected, ended, then scored (or failed).
 *  Runs after the response, a couple of seconds between steps. */
export async function runSimulation(sessionId: string, outcome: SimulatedOutcome): Promise<void> {
  const seedOf = async () => ((await prisma.session.findUniqueOrThrow({ where: { id: sessionId }, select: { personaSeed: true } })).personaSeed ?? {}) as Record<string, unknown>;

  if (outcome === "no_transcript") {
    // Started, then nothing ever came back from the call.
    await pause(2000);
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "FAILED", personaSeed: { ...(await seedOf()), failReason: "no-transcript", failedAt: new Date().toISOString() } as object },
    });
    await emitSessionEvent(sessionId, "session.failed");
    return;
  }

  await pause(1500);
  await prisma.session.update({ where: { id: sessionId }, data: { personaSeed: { ...(await seedOf()), connectedAt: new Date().toISOString() } as object } });
  await emitSessionEvent(sessionId, "session.started");

  const tooShort = outcome === "too_short";
  const duration = tooShort ? 38 : 312;
  const turns = tooShort ? TRANSCRIPT.slice(0, 3) : TRANSCRIPT;
  await pause(2500);
  await prisma.session.update({ where: { id: sessionId }, data: { completedAt: new Date(), durationSeconds: duration } });
  await prisma.evaluation.create({ data: { sessionId, rawPayload: { simulated: true, data: { transcript: turns } } as object } });
  await emitSessionEvent(sessionId, "session.ended");

  await pause(2500);
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId }, select: { serviceType: true } });
  const rubric = rubricForService(session.serviceType);
  const evaluation = await prisma.evaluation.update({
    where: { sessionId },
    data: tooShort
      ? { rubricId: rubric.id, overallScore: null, narrative: "Too short to score.", wins: [], misses: [], replacementPhrases: [], scoredAt: new Date() }
      : {
          rubricId: rubric.id,
          overallScore: "3.6",
          booked: true,
          narrative: "Booked Linda for Thursday at 2 by tying the visit to her daughter's wedding — next time, dig into the cost worry before offering times.",
          wins: ["Asked what made her reach out instead of pitching first.", "Connected the appointment to the wedding — her real reason."],
          misses: ["Moved to scheduling before fully exploring the cost worry.", "Didn't confirm her phone number or send a reminder."],
          replacementPhrases: [
            { from: "Let's get you in for a consultation.", to: "Would it help to see what this could look like for the wedding photos? The doctor can show you at a free consult." },
          ],
          personaCoaching: "Linda opens up when you show interest in her life — stay curious a beat longer before booking.",
          recommendedNextScenario: "Try a tough lead who brings up cost early.",
          reveal: {
            why: { found: "yes", note: "At 0:34 she shared the wedding photos worry after a follow-up question." },
            hesitation: { handled: "partly", note: "Financing came up, but the monthly cost was never made concrete." },
          },
          scoredAt: new Date(),
        },
  });
  if (!tooShort) {
    await prisma.skillScore.createMany({
      data: rubric.skills.map((k, i) => ({
        evaluationId: evaluation.id,
        skillKey: k.key,
        tier: k.tier === "universal" ? ("UNIVERSAL" as const) : ("SERVICE_SPECIFIC" as const),
        score: SCORES[i % SCORES.length].toFixed(1),
        reasoning: `Simulated note for ${k.name}.`,
      })),
    });
  }
  await prisma.session.update({ where: { id: sessionId }, data: { status: "SCORED" } });
  await emitSessionEvent(sessionId, tooShort ? "session.failed" : "session.completed");
}
