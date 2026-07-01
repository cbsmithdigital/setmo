// Marketing demo data for the Meridian DSO group view: give the four non-flagship
// locations real setters with recent, rising, per-location-distinct skill profiles
// so the group Portfolio + Performance pages read like a real multi-location DSO.
// Value building stays the group-wide soft spot (the "central playbook gap" story).
// Re-runnable. Run: pnpm exec tsx prisma/demo-meridian.ts
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_WINS, DEMO_MISSES, DEMO_PHRASES, DEMO_NEXT_SCENARIO, demoTranscriptPayload } from "./demo-content";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const KEYS = ["rapport", "listening", "discovery", "painpoint", "objection", "confidence", "value", "closing"];
const UNIVERSAL = new Set(["rapport", "listening", "objection", "confidence", "closing"]);
const tierOf = (k: string) => (UNIVERSAL.has(k) ? "UNIVERSAL" : "SERVICE_SPECIFIC");
const clamp = (n: number) => Math.max(1, Math.min(5, Number(n.toFixed(1))));
const avg = (m: Record<string, number>) => Number((KEYS.reduce((s, k) => s + m[k], 0) / KEYS.length).toFixed(1));

// A realistic skill SHAPE (offsets ~sum to 0): rapport/closing strong, value/pain-point soft.
const SHAPE: Record<string, number> = {
  rapport: 0.5, listening: 0.3, discovery: -0.1, painpoint: -0.5,
  objection: 0.0, confidence: 0.2, value: -0.7, closing: 0.3,
};

const PERSONAS = [
  "Anxious first-timer", "Price-driven, guarded", "Warm but busy", "Skeptical comparison shopper",
  "Spouse-needs-to-approve", "Researching for a parent", "Been putting it off for years", "Insurance-focused",
];

type SetterCfg = { email: string; first: string; last: string; target: number; improve: number };
type OfficeCfg = {
  office: string;
  // per-office skill tweaks layered on top of SHAPE — gives the heatmap texture
  adjust: Record<string, number>;
  setters: SetterCfg[];
};

const PLAN: OfficeCfg[] = [
  {
    // Brightwork's non-Sam teammates: base seed gave them overall-only evals with
    // no skill breakdown, so they were missing from the office heatmap. Backfill
    // skill data aligned to the leaderboard ladder demo-sam.ts sets. (Sam is owned
    // by demo-sam.ts and is intentionally excluded here.)
    office: "Brightwork Dental",
    adjust: {},
    setters: [
      { email: "jordan@brightworkdental.com", first: "Jordan", last: "Reyes", target: 4.7, improve: 0.5 },
      { email: "maya@brightworkdental.com", first: "Maya", last: "Khan", target: 4.4, improve: 0.6 },
      { email: "theo@brightworkdental.com", first: "Theo", last: "Davis", target: 3.8, improve: 0.7 },
      { email: "priya@brightworkdental.com", first: "Priya", last: "Anand", target: 3.6, improve: 0.6 },
      { email: "marcus@brightworkdental.com", first: "Marcus", last: "Hill", target: 3.4, improve: 0.5 },
    ],
  },
  {
    office: "Coastal Smiles", // flagship-strong
    adjust: { rapport: 0.2, painpoint: -0.2 },
    setters: [
      { email: "setter6@coastalsmiles.example", first: "Grace", last: "Lin", target: 4.6, improve: 0.5 },
      { email: "setter7@coastalsmiles.example", first: "Caleb", last: "Boone", target: 4.2, improve: 0.7 },
    ],
  },
  {
    office: "Lakeside Implants", // strong, steady
    adjust: { closing: 0.2, value: -0.2 },
    setters: [
      { email: "setter2@lakesideimplants.example", first: "Bianca", last: "Flores", target: 4.4, improve: 0.6 },
      { email: "setter3@lakesideimplants.example", first: "Diego", last: "Ramos", target: 4.0, improve: 0.8 },
    ],
  },
  {
    office: "Apex Oral Care", // mid, improving
    adjust: { discovery: -0.3, listening: 0.2 },
    setters: [
      { email: "setter4@apexoralcare.example", first: "Hannah", last: "Webb", target: 3.9, improve: 0.7 },
      { email: "setter5@apexoralcare.example", first: "Owen", last: "Pierce", target: 3.6, improve: 0.9 },
    ],
  },
  {
    office: "Summit Dental Co.", // struggling — the "watch" location
    adjust: { objection: -0.3, value: -0.2, confidence: 0.2 },
    setters: [
      { email: "setter8@summitdentalco.example", first: "Nora", last: "Page", target: 3.5, improve: 0.6 },
      { email: "setter9@summitdentalco.example", first: "Eli", last: "Brooks", target: 3.3, improve: 0.5 },
    ],
  },
];

const SESSIONS_PER_SETTER = 9; // spread across ~40 days so this-month AND last-month windows have data

async function main() {
  const implant = await prisma.agent.findUnique({ where: { serviceType: "IMPLANT" } });
  const now = new Date();
  let totalSessions = 0;

  for (const oc of PLAN) {
    const office = await prisma.office.findFirst({ where: { name: oc.office } });
    if (!office) {
      console.log(`! office not found: ${oc.office}`);
      continue;
    }

    for (const sc of oc.setters) {
      const setter = await prisma.user.findFirst({ where: { email: sc.email } });
      if (!setter) {
        console.log(`! setter not found: ${sc.email}`);
        continue;
      }
      // real name + active
      await prisma.user.update({ where: { id: setter.id }, data: { firstName: sc.first, lastName: sc.last, status: "ACTIVE" } });
      // wipe prior practice sessions (cascades evaluation + skills)
      await prisma.session.deleteMany({ where: { setterId: setter.id, kind: "PRACTICE" } });

      // current per-skill target for this setter (SHAPE + office adjust), then backfill rising.
      const current: Record<string, number> = {};
      for (const k of KEYS) current[k] = clamp(sc.target + (SHAPE[k] ?? 0) + (oc.adjust[k] ?? 0));

      for (let j = 0; j < SESSIONS_PER_SETTER; j++) {
        const frac = (j + 1) / SESSIONS_PER_SETTER; // 0→1 rising
        const scores: Record<string, number> = {};
        for (const k of KEYS) {
          const start = current[k] - sc.improve;
          scores[k] = clamp(start + (current[k] - start) * frac);
        }
        const overall = avg(scores);
        // Newest few land in the CURRENT month (healthy "this month" even on the
        // 1st); the rest spread back ~30 days for trend + prior-period deltas.
        const fromNewest = SESSIONS_PER_SETTER - 1 - j; // 0 = newest
        const startedAt = fromNewest < 4
          ? new Date(now.getTime() - (fromNewest * 2 + 1) * 3600_000)
          : new Date(now.getTime() - (5 + (fromNewest - 4) * 6) * 86400_000);
        const dur = 360 + j * 35 + (j % 2) * 20;
        const booked = overall >= 4.0 ? j % 5 !== 0 : j % 3 === 0;

        const session = await prisma.session.create({
          data: {
            setterId: setter.id, officeId: office.id, serviceType: "IMPLANT", agentId: implant?.id,
            kind: "PRACTICE", status: "SCORED", difficulty: "ADAPTIVE",
            personaSeed: { persona: PERSONAS[j % PERSONAS.length] },
            startedAt, completedAt: new Date(startedAt.getTime() + dur * 1000), durationSeconds: dur,
          },
        });
        const evaluation = await prisma.evaluation.create({
          data: {
            sessionId: session.id, overallScore: overall.toFixed(1),
            narrative: "Steady rep — momentum building.",
            wins: DEMO_WINS,
            misses: DEMO_MISSES,
            replacementPhrases: DEMO_PHRASES,
            recommendedNextScenario: DEMO_NEXT_SCENARIO,
            rawPayload: demoTranscriptPayload(dur),
            booked, scoredAt: new Date(startedAt.getTime() + dur * 1000 + 5000),
          },
        });
        await prisma.skillScore.createMany({
          data: KEYS.map((k) => ({ evaluationId: evaluation.id, skillKey: k, tier: tierOf(k), score: scores[k].toFixed(1) })),
        });
        totalSessions++;
      }
      console.log(`  ${sc.first} ${sc.last} @ ${oc.office}: ${SESSIONS_PER_SETTER} sessions → current ${avg(current)}`);
    }
  }

  // Reported outcomes for the current month — a realistic mix so the funnel shows
  // "Actual" vs "Projected" side by side. Brightwork reports leads+consults only
  // (cases/production then project downstream); Coastal + Lakeside report fully.
  const pk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const OUTCOMES: { office: string; monthlyLeads: number; consultsBooked: number; casesStarted: number | null; production: number | null; note: string | null }[] = [
    { office: "Brightwork Dental", monthlyLeads: 24, consultsBooked: 14, casesStarted: null, production: null, note: "Heavy implant marketing push mid-month." },
    { office: "Coastal Smiles", monthlyLeads: 30, consultsBooked: 22, casesStarted: 6, production: 84000, note: "Two full-arch cases closed same week." },
    { office: "Lakeside Implants", monthlyLeads: 26, consultsBooked: 18, casesStarted: 5, production: 60000, note: null },
  ];
  for (const oc of OUTCOMES) {
    const office = await prisma.office.findFirst({ where: { name: oc.office } });
    if (!office) continue;
    await prisma.officeOutcome.upsert({
      where: { officeId_periodLabel: { officeId: office.id, periodLabel: pk } },
      create: { officeId: office.id, periodLabel: pk, monthlyLeads: oc.monthlyLeads, consultsBooked: oc.consultsBooked, casesStarted: oc.casesStarted, production: oc.production, note: oc.note },
      update: { monthlyLeads: oc.monthlyLeads, consultsBooked: oc.consultsBooked, casesStarted: oc.casesStarted, production: oc.production, note: oc.note },
    });
  }

  // Flat Practice Access + a rolling minute balance per location (new pricing
  // model), so the billing + balance UI reads healthily across the group.
  const allOffices = await prisma.office.findMany({ where: { name: { in: PLAN.map((p) => p.office) } }, select: { id: true } });
  for (const o of allOffices) {
    await prisma.subscription.upsert({
      where: { officeId: o.id },
      update: { status: "ACTIVE" },
      create: { officeId: o.id, status: "ACTIVE" },
    });
    await prisma.conversationBundle.deleteMany({ where: { officeId: o.id } });
    // 1,000 min @ $0.60 = $600 (within the self-serve cap) — twice, to show rebuys
    await prisma.conversationBundle.createMany({
      data: [
        { officeId: o.id, hours: 17, minutesPurchased: 1000, minutesRemaining: 1000, amountCents: 60000 },
        { officeId: o.id, hours: 17, minutesPurchased: 1000, minutesRemaining: 1000, amountCents: 60000 },
      ],
    });
  }

  console.log(`\n✅ Meridian demo refreshed: ${totalSessions} sessions across ${PLAN.length} locations + ${OUTCOMES.length} reported outcomes (${pk}) + flat access & 2,000-min balances.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
