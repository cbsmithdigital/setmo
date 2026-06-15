import { prisma } from "@/lib/db";
import { skillName, skillTier, rubricFor } from "@/lib/skills";
import { SERVICE_META } from "@/lib/service-meta";
import type { ServiceKey } from "@/generated/prisma/client";

// ---- tunable constants (the prospect-facing recovery math lives here) ----
export const AUDIT_CALLS = 5;
export const AUDIT_BOOKED_THRESHOLD = 4.0; // a call counts as "booked" at/above this overall
export const ACHIEVABLE_RATE = 0.7; // set rate a trained setter can reach
export const DEFAULT_CASE_VALUE = 12000; // full-arch default
export const DEFAULT_MONTHLY_LEADS = 20;
export const AUDIT_CALL_MAX_SECONDS = 12 * 60; // hard cap per audit call

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

/** True if another audit on this domain already got past intake (one-free-per-practice). */
export async function domainUsedBefore(domain: string, exceptId?: string): Promise<boolean> {
  const prior = await prisma.setterAudit.findFirst({
    where: {
      emailDomain: domain.toLowerCase(),
      id: exceptId ? { not: exceptId } : undefined,
      status: { in: ["ACTIVE", "SCORED"] },
    },
    select: { id: true },
  });
  return Boolean(prior);
}

// ---- the estimated-recovery model (see SetMo_product_charge_catalog §3) ----
export function estimateRecovery(opts: {
  bookedCount: number;
  totalCalls?: number;
  caseValueUsd?: number | null;
  monthlyLeads?: number | null;
}) {
  const totalCalls = opts.totalCalls || AUDIT_CALLS;
  const caseValue = opts.caseValueUsd ?? DEFAULT_CASE_VALUE;
  const monthlyLeads = opts.monthlyLeads ?? DEFAULT_MONTHLY_LEADS;
  const currentRate = totalCalls ? opts.bookedCount / totalCalls : 0;
  const gain = Math.max(0, ACHIEVABLE_RATE - currentRate);
  const recoveredPerMonth = Math.round(monthlyLeads * gain);
  return {
    currentRate,
    achievableRate: ACHIEVABLE_RATE,
    recoveredPerMonth,
    dollarValue: recoveredPerMonth * caseValue,
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
  const bookedCount = overalls.filter((o) => o >= AUDIT_BOOKED_THRESHOLD).length;

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
  const topLeaks = [...sums.entries()]
    .map(([key, v]) => ({ key, name: skillName(key), score: Number((v.total / v.n).toFixed(1)) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const recovery = estimateRecovery({
    bookedCount,
    totalCalls: AUDIT_CALLS,
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
      booked: o >= AUDIT_BOOKED_THRESHOLD,
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
