// Marketing demo data for Sam: keep the most recent REAL call as the showcase
// (real transcript + recording), give it a polished current scorecard, backfill
// a rising history before it, and keep pain-point/value as the visible growth
// areas. Re-runnable. Run: pnpm exec tsx prisma/demo-sam.ts
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const UNIVERSAL = new Set(["rapport", "listening", "objection", "confidence", "closing"]);
const tierOf = (k: string) => (UNIVERSAL.has(k) ? "UNIVERSAL" : "SERVICE_SPECIFIC");

// Curated "current" snapshot — strong, but pain-point/value/discovery lag.
const CURRENT: Record<string, number> = {
  rapport: 4.6, listening: 4.4, discovery: 3.9, painpoint: 3.2,
  objection: 4.1, confidence: 4.4, value: 3.5, closing: 4.3,
};
// How much each skill improved over the backfill window (start = current - improve).
const IMPROVE: Record<string, number> = {
  rapport: 0.7, listening: 0.7, discovery: 0.9, painpoint: 0.6,
  objection: 1.1, confidence: 0.8, value: 0.7, closing: 0.8,
};
const KEYS = Object.keys(CURRENT);
const avg = (m: Record<string, number>) => Number((KEYS.reduce((s, k) => s + m[k], 0) / KEYS.length).toFixed(1));
const clamp = (n: number) => Math.max(1, Math.min(5, Number(n.toFixed(1))));

const PERSONAS = [
  "Anxious first-timer", "Price-driven, guarded", "Warm but busy", "Skeptical comparison shopper",
  "Spouse-needs-to-approve", "Researching for a parent", "Been putting it off for years",
];

async function main() {
  const sam = await prisma.user.findFirst({ where: { email: "sam@brightworkdental.com" } });
  if (!sam?.officeId) return console.log("Sam not found.");

  // Showcase = most recent scored practice call (the real calls are the newest;
  // synthetic seed data is dated weeks back). Keeps its real transcript/recording.
  const showcase = await prisma.session.findFirst({
    where: { setterId: sam.id, kind: "PRACTICE", evaluation: { isNot: null } },
    orderBy: { startedAt: "desc" },
    include: { evaluation: true },
  });
  if (!showcase?.evaluation) return console.log("No call found for Sam to use as showcase.");
  const anchor = showcase.startedAt;

  // Polished current scorecard on the showcase (keep its transcript/audio/feedback).
  await prisma.skillScore.deleteMany({ where: { evaluationId: showcase.evaluation.id } });
  await prisma.skillScore.createMany({
    data: KEYS.map((k) => ({ evaluationId: showcase.evaluation!.id, skillKey: k, tier: tierOf(k), score: CURRENT[k].toFixed(1) })),
  });
  await prisma.evaluation.update({ where: { id: showcase.evaluation.id }, data: { overallScore: avg(CURRENT).toFixed(1) } });
  await prisma.session.update({ where: { id: showcase.id }, data: { saved: true, savedAt: new Date(anchor.getTime() + 1000) } });

  // Clear Sam's other practice sessions (keep the showcase + any COACH sessions).
  await prisma.session.deleteMany({ where: { setterId: sam.id, kind: "PRACTICE", id: { not: showcase.id } } });

  // Backfill 7 rising sessions before the showcase.
  const implant = await prisma.agent.findUnique({ where: { serviceType: "IMPLANT" } });
  for (let j = 0; j < 7; j++) {
    const frac = (j + 1) / 8;
    const scores: Record<string, number> = {};
    for (const k of KEYS) {
      const start = CURRENT[k] - IMPROVE[k];
      scores[k] = clamp(start + (CURRENT[k] - start) * frac);
    }
    const overall = avg(scores);
    const startedAt = new Date(anchor.getTime() - (7 - j) * 3 * 86400_000);
    const dur = 480 + j * 25;
    const session = await prisma.session.create({
      data: {
        setterId: sam.id, officeId: sam.officeId, serviceType: "IMPLANT", agentId: implant?.id,
        kind: "PRACTICE", status: "SCORED", difficulty: "ADAPTIVE",
        personaSeed: { persona: PERSONAS[j % PERSONAS.length] },
        startedAt, completedAt: new Date(startedAt.getTime() + dur * 1000), durationSeconds: dur,
      },
    });
    const evaluation = await prisma.evaluation.create({
      data: {
        sessionId: session.id, overallScore: overall.toFixed(1),
        narrative: "Solid rep — momentum building, especially on objections.",
        wins: ["Opened warm and human", "Held composure under price pressure"],
        misses: ["Didn't fully explore the 'why' behind the delay", "Skipped the value framing before quoting"],
        replacementPhrases: [],
      },
    });
    await prisma.skillScore.createMany({
      data: KEYS.map((k) => ({ evaluationId: evaluation.id, skillKey: k, tier: tierOf(k), score: scores[k].toFixed(1) })),
    });
  }

  // Recommendation + memory pointed at the weakest skill.
  await prisma.recommendation.deleteMany({ where: { setterId: sam.id } });
  await prisma.recommendation.create({
    data: { setterId: sam.id, trainingId: "t2", skillKey: "painpoint", reason: "your pain-point exploration has sat under 3.5 across your last few sessions", status: "ACTIVE" },
  });
  await prisma.setterMemory.upsert({
    where: { setterId: sam.id },
    update: { summary: "Sam is on a clear upward trend (overall ~3.3 → 4.1). Strong rapport, confidence, and closing. Pain-point exploration and value building still lag — escalate discovery-heavy, price-objection personas.", difficultyFloor: "WARM" },
    create: { setterId: sam.id, summary: "Sam is on a clear upward trend. Strong rapport and closing; pain-point and value building lag.", difficultyFloor: "WARM" },
  });

  // Office leaderboard — curated demo ladder so Sam sits mid-pack and rising
  // (his real 4.0 lands #3). Teammate values are demo placeholders.
  const samNow = avg(CURRENT);
  const setters = await prisma.user.findMany({ where: { officeId: sam.officeId, role: "SETTER" }, select: { id: true, firstName: true } });
  const LADDER: Record<string, number> = { Jordan: 4.7, Maya: 4.4, Theo: 3.8, Priya: 3.6, Marcus: 3.4 };
  const rows = setters
    .map((u) => ({ id: u.id, value: u.id === sam.id ? samNow : LADDER[u.firstName ?? ""] ?? 3.5 }))
    .sort((a, b) => b.value - a.value);
  const now = new Date();
  const pk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const move: Record<string, number> = { [sam.id]: 2 };
  await prisma.leaderboardEntry.deleteMany({ where: { scope: "OFFICE", officeId: sam.officeId, serviceType: "IMPLANT" } });
  await prisma.leaderboardEntry.createMany({
    data: rows.map((r, i) => ({
      scope: "OFFICE", officeId: sam.officeId!, subjectType: "SETTER", subjectId: r.id, serviceType: "IMPLANT",
      metric: "AVG_SCORE", value: Number(r.value.toFixed(2)), movement: move[r.id] ?? 0, rank: i + 1, periodKey: pk,
    })),
  });

  const samRank = rows.findIndex((r) => r.id === sam.id) + 1;
  console.log(`✅ Demo refreshed. Sam current overall ${avg(CURRENT)}, office rank #${samRank} of ${rows.length}.`);
  console.log("Showcase call:", showcase.id, "(kept transcript/recording; saved=true)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
