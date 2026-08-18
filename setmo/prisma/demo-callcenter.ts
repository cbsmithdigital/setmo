// Marketing demo for the CALL CENTER tenant: "BrightCall Partners" — two pods,
// a senior manager + a floor manager per pod, phone agents shared across served
// offices, sessions attributed to the call-center pool, and a funded pool. All
// managers AND agents are login-able (pw SetMo-demo-2026). Re-runnable (upserts
// structural entities; only sessions/assignments/bundles are rebuilt).
// Run: pnpm exec tsx prisma/demo-callcenter.ts
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pickCall, transcriptPayload } from "./demo-content";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DEMO_PASSWORD = "SetMo-demo-2026";

const CC = "00000000-0000-0000-0000-00000000cc01";
const POD_N = "cc-pod-north";
const POD_S = "cc-pod-south";

const KEYS = ["rapport", "listening", "discovery", "painpoint", "objection", "confidence", "value", "closing"];
const UNIVERSAL = new Set(["rapport", "listening", "objection", "confidence", "closing"]);
const tierOf = (k: string) => (UNIVERSAL.has(k) ? "UNIVERSAL" : "SERVICE_SPECIFIC");
const clamp = (n: number) => Math.max(1, Math.min(5, Number(n.toFixed(1))));
const avg = (m: Record<string, number>) => Number((KEYS.reduce((s, k) => s + m[k], 0) / KEYS.length).toFixed(1));
const SHAPE: Record<string, number> = { rapport: 0.5, listening: 0.3, discovery: -0.1, painpoint: -0.5, objection: 0.0, confidence: 0.2, value: -0.7, closing: 0.3 };

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function ensureAuthUser(sb: SupabaseClient, email: string, fullName: string): Promise<string> {
  const { data, error } = await sb.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } });
  if (!error && data.user) return data.user.id;
  let page = 1;
  while (page <= 20) {
    const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (list.users.length < 200) break;
    page++;
  }
  throw new Error(`Could not create/find auth user ${email}: ${error?.message}`);
}

type OfficeCfg = { id: string; name: string; city: string; pod: string };
const OFFICES: OfficeCfg[] = [
  { id: "cc-office-cedar", name: "Cedar Park Dental", city: "Austin", pod: POD_N },
  { id: "cc-office-harbor", name: "Harbor View Dental", city: "Seattle", pod: POD_N },
  { id: "cc-office-sunrise", name: "Sunrise Family Dental", city: "Phoenix", pod: POD_S },
  { id: "cc-office-ironwood", name: "Ironwood Dental", city: "Denver", pod: POD_S },
];

type AgentCfg = { first: string; last: string; pod: string; offices: string[]; target: number; improve: number };
const AGENTS: AgentCfg[] = [
  { first: "Ava", last: "Sterling", pod: POD_N, offices: ["cc-office-cedar", "cc-office-harbor"], target: 4.6, improve: 0.6 },
  { first: "Noah", last: "Brooks", pod: POD_N, offices: ["cc-office-cedar", "cc-office-harbor"], target: 4.1, improve: 0.8 },
  { first: "Lily", last: "Chen", pod: POD_N, offices: ["cc-office-cedar"], target: 3.6, improve: 0.7 },
  { first: "Ethan", last: "Reed", pod: POD_S, offices: ["cc-office-sunrise", "cc-office-ironwood"], target: 4.4, improve: 0.6 },
  { first: "Mia", last: "Torres", pod: POD_S, offices: ["cc-office-sunrise", "cc-office-ironwood"], target: 3.9, improve: 0.9 },
  { first: "Jack", last: "Nolan", pod: POD_S, offices: ["cc-office-ironwood"], target: 3.4, improve: 0.6 },
];
const agentEmail = (a: AgentCfg) => `${a.first.toLowerCase()}@brightcall.example`;

async function main() {
  const sb = adminClient();
  if (!sb) console.warn("⚠ No Supabase admin — logins will NOT be created (dashboards still seed with fallback ids).");

  // Volatile data only — structural entities are upserted (no FK-ordering pain).
  await prisma.session.deleteMany({ where: { callCenterOrgId: CC } });
  await prisma.agentOffice.deleteMany({ where: { user: { callCenterPodId: { in: [POD_N, POD_S] } } } });
  await prisma.callCenterBundle.deleteMany({ where: { organizationId: CC } });

  await prisma.organization.upsert({ where: { id: CC }, update: { name: "BrightCall Partners", type: "CALL_CENTER" }, create: { id: CC, name: "BrightCall Partners", type: "CALL_CENTER" } });
  for (const [id, name] of [[POD_N, "Pod North"], [POD_S, "Pod South"]] as const) {
    await prisma.pod.upsert({ where: { id }, update: { name, organizationId: CC }, create: { id, organizationId: CC, name } });
  }
  for (const o of OFFICES) {
    await prisma.office.upsert({
      where: { id: o.id },
      update: { name: o.name, city: o.city, servedByPodId: o.pod, isProspect: false, offerFraming: `${o.name}: free implant consult + 3D scan, financing available.` },
      create: { id: o.id, name: o.name, city: o.city, isProspect: false, servedByPodId: o.pod, offerFraming: `${o.name}: free implant consult + 3D scan, financing available.` },
    });
    await prisma.officeService.upsert({ where: { officeId_serviceType: { officeId: o.id, serviceType: "IMPLANT" } }, update: { enabled: true }, create: { officeId: o.id, serviceType: "IMPLANT", enabled: true } });
  }

  // Senior manager + one floor manager per pod (login-able).
  const managers: { email: string; first: string; last: string; role: "CALL_CENTER_ADMIN" | "CALL_CENTER_MANAGER"; pod: string | null }[] = [
    { email: "morgan@brightcall.example", first: "Morgan", last: "Vale", role: "CALL_CENTER_ADMIN", pod: null },
    { email: "jamie@brightcall.example", first: "Jamie", last: "Cho", role: "CALL_CENTER_MANAGER", pod: POD_N },
    { email: "riley@brightcall.example", first: "Riley", last: "Fox", role: "CALL_CENTER_MANAGER", pod: POD_S },
  ];
  for (const m of managers) {
    const id = sb ? await ensureAuthUser(sb, m.email, `${m.first} ${m.last}`) : `cc-mgr-${m.first.toLowerCase()}`;
    await prisma.user.upsert({
      where: { email: m.email },
      update: { firstName: m.first, lastName: m.last, role: m.role, status: "ACTIVE", organizationId: CC, callCenterPodId: m.pod, officeId: null },
      create: { id, email: m.email, firstName: m.first, lastName: m.last, role: m.role, status: "ACTIVE", organizationId: CC, callCenterPodId: m.pod },
    });
    const scopeType = m.role === "CALL_CENTER_ADMIN" ? "CALL_CENTER" : "POD";
    const scopeId = m.role === "CALL_CENTER_ADMIN" ? CC : m.pod!;
    await prisma.membership.upsert({ where: { userId_role_scopeId: { userId: id, role: m.role, scopeId } }, update: {}, create: { userId: id, role: m.role, scopeType, scopeId } });
  }

  // Agents (login-able) + office assignments + sessions.
  const implant = await prisma.agent.findUnique({ where: { serviceType: "IMPLANT" } });
  const now = new Date();
  let totalSessions = 0;
  for (const a of AGENTS) {
    const email = agentEmail(a);
    const id = sb ? await ensureAuthUser(sb, email, `${a.first} ${a.last}`) : `cc-agent-${a.first.toLowerCase()}`;
    await prisma.user.upsert({
      where: { email },
      update: { firstName: a.first, lastName: a.last, role: "SETTER", status: "ACTIVE", organizationId: CC, callCenterPodId: a.pod, officeId: null },
      create: { id, email, firstName: a.first, lastName: a.last, role: "SETTER", status: "ACTIVE", organizationId: CC, callCenterPodId: a.pod },
    });
    for (const officeId of a.offices) await prisma.agentOffice.create({ data: { userId: id, officeId } });

    const current: Record<string, number> = {};
    for (const k of KEYS) current[k] = clamp(a.target + (SHAPE[k] ?? 0));
    for (let j = 0; j < 9; j++) {
      const frac = (j + 1) / 9;
      const scores: Record<string, number> = {};
      for (const k of KEYS) { const start = current[k] - a.improve; scores[k] = clamp(start + (current[k] - start) * frac); }
      const overall = avg(scores);
      const fromNewest = 8 - j;
      const startedAt = fromNewest < 4 ? new Date(now.getTime() - (fromNewest * 2 + 1) * 3600_000) : new Date(now.getTime() - (5 + (fromNewest - 4) * 6) * 86400_000);
      const officeId = a.offices[j % a.offices.length];
      const dur = 360 + j * 30 + (j % 2) * 20;
      const call = pickCall(overall, j);
      const session = await prisma.session.create({
        data: { setterId: id, officeId, callCenterOrgId: CC, serviceType: "IMPLANT", agentId: implant?.id, kind: "PRACTICE", status: "SCORED", difficulty: "ADAPTIVE", personaSeed: { persona: call.persona }, startedAt, completedAt: new Date(startedAt.getTime() + dur * 1000), durationSeconds: dur },
      });
      const evaluation = await prisma.evaluation.create({
        data: { sessionId: session.id, overallScore: overall.toFixed(1), narrative: call.narrative, wins: call.wins, misses: call.misses, replacementPhrases: call.phrases, recommendedNextScenario: call.nextScenario, rawPayload: transcriptPayload(call, dur), booked: overall >= 4.0 ? j % 4 !== 0 : j % 3 === 0, scoredAt: new Date(startedAt.getTime() + dur * 1000 + 5000) },
      });
      await prisma.skillScore.createMany({ data: KEYS.map((k) => ({ evaluationId: evaluation.id, skillKey: k, tier: tierOf(k), score: scores[k].toFixed(1) })) });
      totalSessions++;
    }
    console.log(`  ${a.first} ${a.last} (${a.pod === POD_N ? "North" : "South"}): 9 sessions across ${a.offices.length} office(s) → current ${avg(current)}`);
  }

  await prisma.callCenterBundle.create({ data: { organizationId: CC, minutesPurchased: 6000, amountCents: 300000 } });

  console.log(`\n✅ BrightCall demo: ${AGENTS.length} agents · ${OFFICES.length} served offices · 2 pods · ${totalSessions} sessions · 6,000-min pool.`);
  console.log(`Logins (pw ${DEMO_PASSWORD}):`);
  console.log(`  Managers: morgan@brightcall.example (senior) · jamie@brightcall.example (Pod North) · riley@brightcall.example (Pod South)`);
  console.log(`  Agents: ${AGENTS.map(agentEmail).join(" · ")}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
