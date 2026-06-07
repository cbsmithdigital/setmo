/**
 * SetMo seed — mirrors the design-handoff prototype mock data
 * (prototype/app/data.js) so the app shows realistic content immediately.
 *
 * Creates real Supabase auth users (via the service-role key) so you can log
 * in, plus the matching application rows. Idempotent: safe to re-run.
 *
 * Run: pnpm db:seed   (requires .env.local with DATABASE_URL/DIRECT_URL +
 *                      NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { IMPLANT_RUBRIC } from "../src/lib/skills";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const DEMO_PASSWORD = "SetMo-demo-2026";

// Stable ids for idempotent upserts.
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const OFFICE_ID = "00000000-0000-0000-0000-0000000000a1";

// ---- Supabase admin (creates auth identities) ----
function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Create (or fetch) a Supabase auth user, return its id.
async function ensureAuthUser(
  sb: SupabaseClient,
  email: string,
  fullName: string
): Promise<string> {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (!error && data.user) return data.user.id;

  // Already exists — page through users to find it.
  let page = 1;
  while (page <= 20) {
    const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const found = list.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (found) return found.id;
    if (list.users.length < 200) break;
    page++;
  }
  throw new Error(`Could not create or find auth user ${email}: ${error?.message}`);
}

// Parse "8:42" -> seconds.
const dur = (mmss: string) => {
  const [m, s] = mmss.split(":").map(Number);
  return m * 60 + s;
};

async function main() {
  const sb = adminClient();
  if (!sb) {
    console.warn(
      "⚠ SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not set — " +
        "seeding app data only; auth users will NOT be created (login won't work)."
    );
  }

  // ---------- organization + office ----------
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: { id: ORG_ID, name: "Meridian DSO", type: "GROUP" },
  });

  await prisma.office.upsert({
    where: { id: OFFICE_ID },
    update: {},
    create: {
      id: OFFICE_ID,
      organizationId: ORG_ID,
      name: "Brightwork Dental",
      city: "Austin, TX",
      offerFraming: "$500 off full-arch · free consult",
      appointmentFraming: "Free 30-minute implant consultation",
      depositPolicy: "No deposit required to book",
      seatCount: 12,
    },
  });

  // ---------- agents (one per service type) ----------
  const agentsData: {
    serviceType: "IMPLANT" | "DENTURE" | "COSMETIC" | "ORTHO" | "WISDOM" | "GENERAL";
    name: string;
    shortName: string;
    status: "LIVE" | "DRAFT" | "PLANNED";
    version?: string;
    personaCount: number;
    note: string;
    env?: string;
  }[] = [
    { serviceType: "IMPLANT", name: "Implant / full-arch / denture", shortName: "Implants", status: "LIVE", version: "v1.4", personaCount: 18, note: "Reference rubric — the flagship call.", env: "ELEVENLABS_AGENT_IMPLANT" },
    { serviceType: "DENTURE", name: "Dentures & snap-in", shortName: "Dentures", status: "LIVE", version: "v1.1", personaCount: 9, note: "Removable & implant-retained denture conversations." },
    { serviceType: "COSMETIC", name: "Cosmetic & veneers", shortName: "Cosmetic", status: "DRAFT", version: "v0.3", personaCount: 6, note: "Vision-casting module in progress." },
    { serviceType: "ORTHO", name: "Ortho & Invisalign", shortName: "Ortho", status: "PLANNED", personaCount: 0, note: "Queued behind cosmetic." },
    { serviceType: "WISDOM", name: "Wisdom teeth", shortName: "Wisdom teeth", status: "PLANNED", personaCount: 0, note: "Surgical scheduling persona set." },
    { serviceType: "GENERAL", name: "General & hygiene", shortName: "General", status: "PLANNED", personaCount: 0, note: "New-patient & recall fundamentals." },
  ];

  const rubricKeys = IMPLANT_RUBRIC.map((s) => s.key);
  for (const a of agentsData) {
    await prisma.agent.upsert({
      where: { serviceType: a.serviceType },
      update: { status: a.status, version: a.version ?? null, personaCount: a.personaCount, note: a.note },
      create: {
        serviceType: a.serviceType,
        name: a.name,
        shortName: a.shortName,
        status: a.status,
        version: a.version ?? null,
        elevenlabsAgentId: "env" in a && a.env ? process.env[a.env] ?? null : null,
        rubricSkills: rubricKeys,
        personaCount: a.personaCount,
        note: a.note,
      },
    });
  }

  // ---------- office services (Brightwork offers implant + denture) ----------
  for (const st of ["IMPLANT", "DENTURE"] as const) {
    await prisma.officeService.upsert({
      where: { officeId_serviceType: { officeId: OFFICE_ID, serviceType: st } },
      update: { enabled: true },
      create: { officeId: OFFICE_ID, serviceType: st, enabled: true },
    });
  }

  // ---------- subscription ----------
  await prisma.subscription.upsert({
    where: { officeId: OFFICE_ID },
    update: { seats: 12, cadence: "MONTHLY", status: "ACTIVE" },
    create: { officeId: OFFICE_ID, seats: 12, cadence: "MONTHLY", pricePerSeat: "59.99", status: "ACTIVE" },
  });

  // ---------- allowance period (current month; 36h pool, 22.4h used) ----------
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  await prisma.allowancePeriod.deleteMany({ where: { officeId: OFFICE_ID } });
  await prisma.allowancePeriod.create({
    data: {
      officeId: OFFICE_ID,
      periodStart,
      periodEnd,
      includedSeconds: BigInt(12 * 180 * 60), // 12 seats × 3h
      bundleSeconds: BigInt(0),
      consumedSeconds: BigInt(Math.round(22.4 * 3600)),
    },
  });

  // ---------- trainings catalog ----------
  const trainings = [
    { id: "t1", title: "Turning price objections into consults", type: "VIDEO", length: 9, targetSkillKey: "objection", status: "PUBLISHED", description: "Reframe price pushback into a booked consult." },
    { id: "t2", title: "Uncovering the real 'why' behind a delay", type: "VIDEO", length: 12, targetSkillKey: "painpoint", status: "PUBLISHED", description: "Surface the emotional driver behind years of putting it off." },
    { id: "t3", title: "The first 20 seconds: building instant rapport", type: "VIDEO", length: 7, targetSkillKey: "rapport", status: "PUBLISHED", description: "Open warm, fast, and human." },
    { id: "t4", title: "Confident framing of high-ticket cases", type: "VIDEO", length: 11, targetSkillKey: "confidence", status: "PUBLISHED", description: "Quote $40k without flinching." },
    { id: "t5", title: "Closing without pressure", type: "VIDEO", length: 10, targetSkillKey: "closing", status: "DRAFT", description: "Ask for the appointment in a way that feels like help." },
    { id: "t6", title: "The Implant Consult Playbook", type: "WORKBOOK", length: 24, targetSkillKey: "discovery", status: "PUBLISHED", description: "Scripts, discovery questions, and objection maps for full-arch calls." },
    { id: "t7", title: "Objection Handling Field Guide", type: "WORKBOOK", length: 16, targetSkillKey: "objection", status: "PUBLISHED", description: "The 12 objections you'll hear most — and the language that turns each one." },
  ] as const;
  for (const t of trainings) {
    await prisma.training.upsert({
      where: { id: t.id },
      update: { status: t.status },
      create: { id: t.id, title: t.title, type: t.type, length: t.length, targetSkillKey: t.targetSkillKey, status: t.status, description: t.description },
    });
  }

  // ---------- users (office admin + setters) ----------
  const people = [
    { key: "lena", email: "lena@brightworkdental.com", firstName: "Lena", lastName: "Okafor", role: "OFFICE_ADMIN", avg: null },
    { key: "jr", email: "jordan@brightworkdental.com", firstName: "Jordan", lastName: "Reyes", role: "SETTER", avg: 4.8 },
    { key: "sc", email: "sam@brightworkdental.com", firstName: "Sam", lastName: "Carter", role: "SETTER", avg: 4.6 },
    { key: "mk", email: "maya@brightworkdental.com", firstName: "Maya", lastName: "Khan", role: "SETTER", avg: 4.5 },
    { key: "td", email: "theo@brightworkdental.com", firstName: "Theo", lastName: "Davis", role: "SETTER", avg: 4.2 },
    { key: "pa", email: "priya@brightworkdental.com", firstName: "Priya", lastName: "Anand", role: "SETTER", avg: 4.0 },
    { key: "mh", email: "marcus@brightworkdental.com", firstName: "Marcus", lastName: "Hill", role: "SETTER", avg: 3.7 },
  ] as const;

  const userIds: Record<string, string> = {};
  // Deterministic fallback ids when auth isn't configured.
  let fallbackN = 1;
  for (const p of people) {
    let id: string;
    if (sb) {
      id = await ensureAuthUser(sb, p.email, `${p.firstName} ${p.lastName}`);
    } else {
      id = `00000000-0000-0000-0000-0000000010${String(fallbackN++).padStart(2, "0")}`;
    }
    userIds[p.key] = id;
    await prisma.user.upsert({
      where: { id },
      update: { firstName: p.firstName, lastName: p.lastName, role: p.role, status: "ACTIVE", officeId: OFFICE_ID, organizationId: ORG_ID },
      create: { id, email: p.email, firstName: p.firstName, lastName: p.lastName, role: p.role, status: "ACTIVE", officeId: OFFICE_ID, organizationId: ORG_ID },
    });
  }

  const samId = userIds["sc"];
  const implantAgent = await prisma.agent.findUnique({ where: { serviceType: "IMPLANT" } });

  // ---------- Sam's sessions + evaluations ----------
  await prisma.session.deleteMany({ where: { setterId: samId } });

  const sessionDefs = [
    { offsetDays: 0, persona: "Skeptical comparison shopper", dur: "8:42", score: 4.6, full: true },
    { offsetDays: 1, persona: "Anxious first-timer", dur: "6:18", score: 3.9, full: false },
    { offsetDays: 3, persona: "Price-driven, guarded", dur: "9:55", score: 3.6, full: false },
    { offsetDays: 6, persona: "Warm but busy", dur: "5:33", score: 3.8, full: false },
  ];

  // Per-skill scores for the headline (full) result, in rubric order.
  const fullSkillScores = [4.6, 4.4, 4.1, 3.8, 4.0, 4.5, 4.8, 4.5];

  for (const s of sessionDefs) {
    const startedAt = new Date(now.getTime() - s.offsetDays * 86400_000);
    const session = await prisma.session.create({
      data: {
        setterId: samId,
        officeId: OFFICE_ID,
        serviceType: "IMPLANT",
        agentId: implantAgent?.id,
        difficulty: "ADAPTIVE",
        personaSeed: { persona: s.persona },
        status: "SCORED",
        startedAt,
        completedAt: new Date(startedAt.getTime() + dur(s.dur) * 1000),
        durationSeconds: dur(s.dur),
      },
    });

    const evaluation = await prisma.evaluation.create({
      data: {
        sessionId: session.id,
        overallScore: s.score.toFixed(1),
        narrative: s.full
          ? "Strong rep. You turned a price objection into a booked consult — that's the whole game."
          : `Solid practice against the ${s.persona.toLowerCase()}. Keep sharpening discovery and closing.`,
        wins: s.full
          ? [
              "Named the $40k competing quote head-on instead of dodging it — built instant trust.",
              "Tied the full-arch outcome to her daughter's wedding. That's emotional discovery done right.",
            ]
          : ["Stayed warm and steady under pressure."],
        misses: s.full
          ? [
              "You let the 'I need to think about it' sit for 6 seconds before responding.",
              "Missed a chance to explore why she's been putting off treatment for two years.",
            ]
          : ["A beat slow to handle the first objection."],
        replacementPhrases: s.full
          ? [
              { from: "We're a bit more expensive, but worth it.", to: "Can I show you exactly what that difference buys you over the next 20 years?" },
              { from: "Okay, take your time.", to: "What's the one thing you'd need to feel sure about to move forward today?" },
            ]
          : [],
        personaCoaching: s.full
          ? "Comparison shoppers need proof, not pressure. Lead with the 20-year outcome, then the price lands lighter."
          : null,
        recommendedNextScenario: s.full
          ? "The 'I'll call you back' ghost — a lead who's warm but keeps slipping away."
          : "A tougher price-driven lead.",
      },
    });

    // Skill scores. Full result uses the headline breakdown; others approximate.
    const scores = s.full
      ? fullSkillScores
      : IMPLANT_RUBRIC.map(() => Math.max(2.5, Math.min(5, s.score + (Math.random() - 0.5))));
    await prisma.skillScore.createMany({
      data: IMPLANT_RUBRIC.map((skill, i) => ({
        evaluationId: evaluation.id,
        skillKey: skill.key,
        tier: skill.tier === "universal" ? "UNIVERSAL" : "SERVICE_SPECIFIC",
        score: scores[i].toFixed(1),
        reasoning: s.full ? `Scored ${scores[i].toFixed(1)} on ${skill.name.toLowerCase()}.` : null,
      })),
    });
  }

  // ---------- Sam's recommendation + memory ----------
  await prisma.recommendation.deleteMany({ where: { setterId: samId } });
  await prisma.recommendation.create({
    data: {
      setterId: samId,
      trainingId: "t2",
      skillKey: "painpoint",
      reason: "your pain-point score has sat under 4.0 for three sessions",
      status: "ACTIVE",
    },
  });
  await prisma.setterMemory.upsert({
    where: { setterId: samId },
    update: {
      summary:
        "Sam is improving fast on objection handling (2.9 → 4.0). Strongest on value building. Pain-point exploration lags under 4.0 — escalate discovery-heavy personas.",
      difficultyFloor: "WARM",
    },
    create: {
      setterId: samId,
      summary:
        "Sam is improving fast on objection handling (2.9 → 4.0). Strongest on value building. Pain-point exploration lags under 4.0 — escalate discovery-heavy personas.",
      difficultyFloor: "WARM",
    },
  });

  // ---------- synthetic data so the leaderboards are populated ----------
  const pk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const jitter = [0.1, -0.1, 0, 0.2, -0.2, 0.15, -0.05];
  const setterScores = new Map<string, number[]>();
  const officeScores = new Map<string, number[]>();

  // Sam's real scores seed Brightwork.
  setterScores.set(samId, sessionDefs.map((s) => s.score));
  officeScores.set(OFFICE_ID, [...sessionDefs.map((s) => s.score)]);

  async function makeSessions(setterId: string, officeId: string, count: number, target: number) {
    if (!setterScores.has(setterId)) setterScores.set(setterId, []);
    if (!officeScores.has(officeId)) officeScores.set(officeId, []);
    for (let i = 0; i < count; i++) {
      const overall = Math.max(2.8, Math.min(4.9, Number((target + jitter[i % jitter.length]).toFixed(1))));
      const startedAt = new Date(now.getTime() - (i + 1) * 2 * 86400_000);
      const seconds = 360 + i * 30;
      const session = await prisma.session.create({
        data: {
          setterId,
          officeId,
          serviceType: "IMPLANT",
          agentId: implantAgent?.id,
          difficulty: "WARM",
          personaSeed: { persona: "Practice lead" },
          status: "SCORED",
          startedAt,
          completedAt: new Date(startedAt.getTime() + seconds * 1000),
          durationSeconds: seconds,
        },
      });
      await prisma.evaluation.create({
        data: { sessionId: session.id, overallScore: overall.toFixed(1), narrative: "Solid practice rep." },
      });
      setterScores.get(setterId)!.push(overall);
      officeScores.get(officeId)!.push(overall);
    }
  }

  // Other Brightwork setters get a short history (Sam already has detailed sessions).
  const brightworkTargets: Record<string, number> = { jr: 4.8, mk: 4.5, td: 4.2, pa: 4.0, mh: 3.7 };
  for (const [key, target] of Object.entries(brightworkTargets)) {
    await makeSessions(userIds[key], OFFICE_ID, 4, target);
  }

  // Sibling offices under Meridian DSO so the global board has competition.
  const siblings = [
    { id: "00000000-0000-0000-0000-0000000000a2", name: "Lakeside Implants", city: "Tucson, AZ", target: 4.5 },
    { id: "00000000-0000-0000-0000-0000000000a3", name: "Apex Oral Care", city: "Denver, CO", target: 4.1 },
    { id: "00000000-0000-0000-0000-0000000000a4", name: "Coastal Smiles", city: "Tampa, FL", target: 3.8 },
    { id: "00000000-0000-0000-0000-0000000000a5", name: "Summit Dental Co.", city: "Boise, ID", target: 3.6 },
  ];
  let synth = 1;
  for (const sib of siblings) {
    await prisma.office.upsert({
      where: { id: sib.id },
      update: {},
      create: { id: sib.id, organizationId: ORG_ID, name: sib.name, city: sib.city, seatCount: 6 },
    });
    for (let k = 0; k < 2; k++) {
      const sid = `00000000-0000-0000-0000-0000000200${String(synth++).padStart(2, "0")}`;
      await prisma.user.upsert({
        where: { id: sid },
        update: { officeId: sib.id },
        create: {
          id: sid,
          email: `setter${synth}@${sib.name.toLowerCase().replace(/[^a-z]+/g, "")}.example`,
          firstName: "Setter",
          lastName: String(synth),
          role: "SETTER",
          status: "ACTIVE",
          officeId: sib.id,
          organizationId: ORG_ID,
        },
      });
      await makeSessions(sid, sib.id, 4, sib.target);
    }
  }

  // ---------- materialize leaderboards (fairness-weighted: average, not volume) ----------
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  // Office scope — Brightwork's setters.
  const brightworkRows = [...setterScores.entries()]
    .filter(([, scores]) => scores.length)
    .map(([subjectId, scores]) => ({ subjectId, value: mean(scores) }))
    .filter((r) =>
      // only Brightwork setters
      ["sc", "jr", "mk", "td", "pa", "mh"].map((k) => userIds[k]).includes(r.subjectId)
    )
    .sort((a, b) => b.value - a.value);

  await prisma.leaderboardEntry.deleteMany({ where: { scope: "OFFICE", officeId: OFFICE_ID, serviceType: "IMPLANT" } });
  await prisma.leaderboardEntry.createMany({
    data: brightworkRows.map((r, i) => ({
      scope: "OFFICE",
      officeId: OFFICE_ID,
      subjectType: "SETTER",
      subjectId: r.subjectId,
      serviceType: "IMPLANT",
      metric: "AVG_SCORE",
      value: Number(r.value.toFixed(2)),
      movement: 0,
      rank: i + 1,
      periodKey: pk,
    })),
  });

  // Global scope — offices ranked by average.
  const globalRows = [...officeScores.entries()]
    .map(([subjectId, scores]) => ({ subjectId, value: mean(scores) }))
    .sort((a, b) => b.value - a.value);

  await prisma.leaderboardEntry.deleteMany({ where: { scope: "GLOBAL", serviceType: "IMPLANT" } });
  await prisma.leaderboardEntry.createMany({
    data: globalRows.map((r, i) => ({
      scope: "GLOBAL",
      subjectType: "OFFICE",
      subjectId: r.subjectId,
      serviceType: "IMPLANT",
      metric: "AVG_SCORE",
      value: Number(r.value.toFixed(2)),
      movement: 0,
      rank: i + 1,
      periodKey: pk,
    })),
  });

  console.log("\n✅ Seed complete.");
  if (sb) {
    console.log("\nDemo logins (password for all):", DEMO_PASSWORD);
    console.log("  Setter:        sam@brightworkdental.com");
    console.log("  Office admin:  lena@brightworkdental.com");
    console.log("  Other setters: jordan@, maya@, theo@, priya@, marcus@brightworkdental.com");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
