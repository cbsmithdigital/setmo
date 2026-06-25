import { prisma } from "@/lib/db";
import { skillName, skillTier, rubricFor } from "@/lib/skills";
import { SERVICE_META } from "@/lib/service-meta";
import type { ServiceKey } from "@/generated/prisma/client";

// ---- tunable constants (the prospect-facing recovery math lives here) ----
export const AUDIT_CALLS = 5;
export const DEFAULT_CASE_VALUE = 12000; // full-arch default
export const DEFAULT_MONTHLY_LEADS = 20;
export const AUDIT_CALL_MAX_SECONDS = 12 * 60; // hard cap per audit call
// recovery model
const SKILL_TARGET = 4.2; // what a trained setter scores
const SHOW_RATE = 0.65; // booked consults that actually show
export const CASE_ACCEPTANCE = 0.4; // shown consults that start treatment

// Consumer/free email providers — these and duplicate domains route to manual approval.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com",
  "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me",
  "protonmail.com", "gmx.com", "gmx.net", "zoho.com", "yandex.com", "mail.com", "comcast.net",
]);

export function emailDomainOf(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}
export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

// Prospects get one free audit per EMAIL every 30 days (configurable).
export const ASSESSMENT_COOLDOWN_DAYS = 30;

/** Whether this email already used its free audit within the cooldown window. */
export async function emailUsedRecently(email: string, exceptId?: string): Promise<{ used: boolean; nextAt: Date | null }> {
  const { getPlatformConfig } = await import("@/lib/config");
  const days = (await getPlatformConfig()).assessmentCooldownDays;
  const since = new Date(Date.now() - days * 86400_000);
  const prior = await prisma.setterAudit.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      id: exceptId ? { not: exceptId } : undefined,
      status: { in: ["ACTIVE", "SCORED"] },
      createdAt: { gte: since },
    },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return { used: Boolean(prior), nextAt: prior ? new Date(prior.createdAt.getTime() + days * 86400_000) : null };
}

// ---- per-call likely show rate ----
// Whether a booked consult actually SHOWS is driven by how well the setter built
// commitment on the call: pain severity surfaced, the lead's real "why", value
// built, objections handled, and a firm commitment/scarcity at the close. Maps a
// weighted skill composite (1–5) to a realistic show-rate band:
//   exceptional ~70s · good ~50 · normal 35–40 · weak <35.
const SHOW_WEIGHTS: Record<string, number> = {
  painpoint: 0.25, // severe, well-surfaced pain → they show
  discovery: 0.2, // got to the real "why"
  value: 0.2, // built value beyond price
  objection: 0.15, // resolved concerns
  closing: 0.15, // firm commitment / scarcity
  rapport: 0.05, // trust
};

export function callShowRate(skills: { skillKey: string; score: number }[]): number {
  const map = new Map(skills.map((s) => [s.skillKey, s.score]));
  let weighted = 0;
  let wsum = 0;
  for (const [key, w] of Object.entries(SHOW_WEIGHTS)) {
    const sc = map.get(key);
    if (sc == null) continue;
    weighted += w * sc;
    wsum += w;
  }
  const composite = wsum ? weighted / wsum : 3; // 1–5
  return Math.max(18, Math.min(74, Math.round(14 * composite)));
}

// Color band for a likely-show-rate pill: ≤35 grey · 36–45 red · 46–55 yellow · 56+ green.
export function showRateColor(rate: number): { bg: string; fg: string } {
  if (rate >= 56) return { bg: "rgba(52,211,153,.15)", fg: "var(--mint)" };
  if (rate >= 46) return { bg: "rgba(251,191,36,.16)", fg: "var(--amber)" };
  if (rate >= 36) return { bg: "rgba(239,68,68,.15)", fg: "#fb7185" };
  return { bg: "rgba(148,163,184,.15)", fg: "var(--muted)" };
}

// ---- estimated-recovery model ----
// Driven by the conversation MISSES: weak objection/closing caps the set rate,
// weak rapport/discovery/value caps the show rate. We funnel a conservative lift
// down to TREATMENT STARTS and keep the headline to a credible 1–3 / month.
const clampRange = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function estimateRecovery(opts: {
  skillAvg: Record<string, number>;
  caseValueUsd?: number | null;
  monthlyLeads?: number | null;
}) {
  const caseValue = opts.caseValueUsd ?? DEFAULT_CASE_VALUE;
  const monthlyLeads = opts.monthlyLeads ?? DEFAULT_MONTHLY_LEADS;
  const avgGap = (keys: string[]) => {
    const gaps = keys.map((k) => Math.max(0, SKILL_TARGET - (opts.skillAvg[k] ?? SKILL_TARGET)));
    return gaps.reduce((a, b) => a + b, 0) / (keys.length || 1);
  };
  const setRateLift = clampRange((avgGap(["objection", "closing"]) / 5) * 0.5, 0.05, 0.18);
  const showRateLift = clampRange((avgGap(["rapport", "discovery", "painpoint", "value"]) / 5) * 0.4, 0.03, 0.12);
  const rawStarts = monthlyLeads * (setRateLift + showRateLift) * SHOW_RATE * CASE_ACCEPTANCE;
  const treatmentStartsPerMonth = Math.max(1, Math.min(3, Math.round(rawStarts) || 1));
  return {
    setRateLiftPts: Math.round(setRateLift * 100), // whole percentage points
    showRateLiftPts: Math.round(showRateLift * 100),
    treatmentStartsPerMonth,
    dollarValue: treatmentStartsPerMonth * caseValue,
    caseValue,
    monthlyLeads,
  };
}

export type AuditCallState = "waiting" | "scoring" | "scored";

/** Per-call states for the runner: waiting (transcript not captured) → scoring
 * (captured, awaiting the score) → scored. Drives the N/5 status bars. */
export async function auditCallCounts(auditId: string) {
  const sessions = await prisma.session.findMany({
    where: { auditId },
    orderBy: { startedAt: "asc" },
    select: { evaluation: { select: { scoredAt: true } } },
  });
  const calls: AuditCallState[] = sessions.map((s) =>
    !s.evaluation ? "waiting" : s.evaluation.scoredAt ? "scored" : "scoring"
  );
  return { total: sessions.length, scored: calls.filter((c) => c === "scored").length, calls };
}

/** Compute + persist the report once all 5 calls are scored. Idempotent. */
export async function finalizeAudit(auditId: string) {
  const audit = await prisma.setterAudit.findUnique({ where: { id: auditId } });
  if (!audit) return null;

  const sessions = await prisma.session.findMany({
    where: { auditId, evaluation: { scoredAt: { not: null } } },
    include: { evaluation: { include: { skills: true } } },
    orderBy: { startedAt: "asc" },
  });
  if (sessions.length < AUDIT_CALLS) return null; // not all scored yet

  const overalls = sessions.map((s) => Number(s.evaluation!.overallScore ?? 0));
  const overall = overalls.reduce((a, b) => a + b, 0) / overalls.length;
  // Real booking outcome (from the scorer), not inferred from the score.
  const bookedCount = sessions.filter((s) => s.evaluation!.booked === true).length;

  // skill averages across the 5 calls
  const sums = new Map<string, { total: number; n: number }>();
  for (const s of sessions) {
    for (const sk of s.evaluation!.skills) {
      const cur = sums.get(sk.skillKey) ?? { total: 0, n: 0 };
      cur.total += Number(sk.score);
      cur.n += 1;
      sums.set(sk.skillKey, cur);
    }
  }
  const skillAvg: Record<string, number> = {};
  for (const [key, v] of sums) skillAvg[key] = v.total / v.n;
  const topLeaks = [...sums.entries()]
    .map(([key, v]) => ({ key, name: skillName(key), score: Number((v.total / v.n).toFixed(1)) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const recovery = estimateRecovery({
    skillAvg,
    caseValueUsd: audit.caseValueUsd,
    monthlyLeads: audit.monthlyLeads,
  });

  return prisma.setterAudit.update({
    where: { id: auditId },
    data: {
      status: "SCORED",
      overallScore: overall.toFixed(1),
      bookedCount,
      topLeakSkills: topLeaks,
      estimatedRecovery: recovery,
      baselineAt: new Date(),
    },
  });
}

/** The full report shape for the report page. */
export async function buildAuditReport(auditId: string) {
  const audit = await prisma.setterAudit.findUnique({ where: { id: auditId } });
  if (!audit) return null;

  const sessions = await prisma.session.findMany({
    where: { auditId, evaluation: { scoredAt: { not: null } } },
    include: { evaluation: { include: { skills: true } } },
    orderBy: { startedAt: "asc" },
  });

  const order = rubricFor("IMPLANT").map((s) => s.key);
  const sums = new Map<string, { total: number; n: number }>();
  for (const s of sessions) {
    for (const sk of s.evaluation!.skills) {
      const cur = sums.get(sk.skillKey) ?? { total: 0, n: 0 };
      cur.total += Number(sk.score);
      cur.n += 1;
      sums.set(sk.skillKey, cur);
    }
  }
  const skills = [...sums.entries()]
    .map(([key, v]) => ({ key, name: skillName(key), tier: skillTier(key), score: Number((v.total / v.n).toFixed(1)) }))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  const perCall = sessions.map((s, i) => {
    const e = s.evaluation!;
    const o = Number(e.overallScore ?? 0);
    return {
      n: i + 1,
      persona: (s.personaSeed as { persona?: string } | null)?.persona ?? "Practice lead",
      score: o,
      booked: e.booked === true,
      showRate: callShowRate(e.skills.map((sk) => ({ skillKey: sk.skillKey, score: Number(sk.score) }))),
      win: (e.wins as string[] | null)?.[0] ?? null,
      miss: (e.misses as string[] | null)?.[0] ?? null,
      phrase: (e.replacementPhrases as { from: string; to: string }[] | null)?.[0] ?? null,
    };
  });

  const leaks = (audit.topLeakSkills as { key: string; name: string; score: number }[] | null) ?? [];
  const trainings = leaks.length
    ? await prisma.training.findMany({ where: { targetSkillKey: { in: leaks.map((l) => l.key) }, status: "PUBLISHED" }, select: { title: true, targetSkillKey: true } })
    : [];
  const nextSteps = leaks.map((l) => ({
    skill: l.name,
    training: trainings.find((t) => t.targetSkillKey === l.key)?.title ?? `Drill ${l.name.toLowerCase()}`,
  }));

  return {
    id: audit.id,
    practiceName: audit.practiceName,
    status: audit.status,
    service: SERVICE_META["IMPLANT" as ServiceKey].name,
    overall: audit.overallScore != null ? Number(audit.overallScore) : 0,
    bookedCount: audit.bookedCount ?? 0,
    totalCalls: AUDIT_CALLS,
    skills,
    leaks,
    perCall,
    recovery: (audit.estimatedRecovery as ReturnType<typeof estimateRecovery> | null) ?? null,
    nextSteps,
    baselineAt: audit.baselineAt,
  };
}
