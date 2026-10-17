import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { AUDIT_COOKIE } from "@/lib/audit-auth";
import { skillName, skillTier, rubricFor } from "@/lib/skills";
import { SERVICE_META } from "@/lib/service-meta";
import { activationFrom, TOKENS_PER_MINUTE } from "@/lib/pricing";
import { getPlatformConfig, promoBonusMinutes, promoInfo, type PlatformConfig } from "@/lib/config";
import type { ServiceKey } from "@/generated/prisma/client";

// ---- tunable constants (the prospect-facing recovery math lives here) ----
export const AUDIT_CALLS = 1; // one-call trial (was 5) — less friction
export const DEFAULT_CASE_VALUE = 12000; // full-arch default
export const MIN_CASE_VALUE = 1000; // a typed case value under this ("15") isn't an implant case: not given
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

type PriorAudit = { id: string; status: string; token: string; practiceName: string };

/** Whether this email already used its free audit within the cooldown window,
 *  and the audit that's still open for it, if any: one that's verified but has
 *  no report yet (ACTIVE, or waiting for a review), whose link can just be
 *  sent again. */
export async function emailUsedRecently(
  email: string,
  exceptId?: string
): Promise<{ used: boolean; nextAt: Date | null; unfinished: PriorAudit | null }> {
  const days = (await getPlatformConfig()).assessmentCooldownDays;
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await prisma.setterAudit.findMany({
    where: {
      email: email.trim().toLowerCase(),
      id: exceptId ? { not: exceptId } : undefined,
      status: { in: ["ACTIVE", "SCORED", "PENDING_APPROVAL"] },
      createdAt: { gte: since },
    },
    select: { id: true, status: true, token: true, practiceName: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  // Waiting for review doesn't use the free audit; a call or a report does.
  const prior = rows.find((r) => r.status !== "PENDING_APPROVAL");
  const open = prior ? (prior.status === "ACTIVE" ? prior : null) : (rows[0] ?? null);
  return {
    used: Boolean(prior),
    nextAt: prior ? new Date(prior.createdAt.getTime() + days * 86400_000) : null,
    unfinished: open ? { id: open.id, status: open.status, token: open.token, practiceName: open.practiceName } : null,
  };
}

/** A number as people type it into the intake: "$12,000", "12,000", "12k",
 *  "30 thousand", or a range's first number ("20-30" → 20, and "15-20k" →
 *  15,000: the k is the range's). Blank, junk, or outside `min`–`max` → null,
 *  i.e. not given, so the practice average is used instead. */
export function parseAmount(v: number | string | null | undefined, max: number, min = 0): number | null {
  if (v == null) return null;
  let n: number;
  if (typeof v === "number") n = v;
  else {
    const s = v.replace(/[$,\s]/g, "").toLowerCase();
    const m = s.match(/^[^\d.]*(\d+(?:\.\d+)?|\.\d+)(k|thousand)?/);
    if (!m) return null;
    n = Number(m[1]);
    // Its own k, or one closing a range of small numbers ("12,000-15k" stays 12,000).
    if (m[2] || (n < 1000 && /\d(k|thousand)/.test(s))) n *= 1000;
  }
  if (!Number.isFinite(n) || n <= 0 || n < min || n > max) return null;
  return Math.round(n);
}

/** The link a prospect sends their setter ("send to your setter"): it runs the
 *  call and opens the report, but can't create the practice's account — that
 *  login is the owner's. The setter's browser keeps this token, never the
 *  owner's (loadAuditAccess). An HMAC of the audit's own secret, so it needs no
 *  column, and the owner's token can't be worked back from it. */
export function setterLinkToken(audit: { id: string; token: string }): string {
  return createHmac("sha256", audit.token).update(`setter-link:${audit.id}`).digest("base64url");
}
export function isSetterLinkToken(audit: { id: string; token: string }, token: string): boolean {
  const want = Buffer.from(setterLinkToken(audit));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** The assessment this browser can open, from the access cookie its verify
 *  link set (lib/audit-auth): with the owner's own token, or with a setter
 *  link's (`asSetter`), which can't create the practice's account. */
export async function loadAuditAccess(id: string) {
  const v = (await cookies()).get(AUDIT_COOKIE)?.value;
  if (!v) return null;
  const [cid, token] = v.split(":");
  if (cid !== id || !token) return null;
  const audit = await prisma.setterAudit.findUnique({ where: { id } });
  if (!audit) return null;
  if (audit.token === token) return { ...audit, asSetter: false };
  return isSetterLinkToken(audit, token) ? { ...audit, asSetter: true } : null;
}

/** What it takes to get going after the assessment, from the live config —
 *  the numbers the activation checkout charges on the monthly plan. During a
 *  sign-up promo activation can be access-only (the bonus tokens are the
 *  starter balance). */
export function activationCost(cfg: PlatformConfig) {
  const from = activationFrom(cfg, cfg.monthlyTokenDiscountPct);
  const bonusTokens = promoBonusMinutes(cfg, "monthly") * TOKENS_PER_MINUTE;
  return {
    accessMonthly: cfg.accessMonthly,
    starterTokens: from.starterTokens,
    starterUsd: from.starter,
    dayOneUsd: bonusTokens > 0 ? cfg.accessMonthly : from.total,
    bonusTokens,
    promoEndsAt: bonusTokens > 0 ? (promoInfo(cfg)?.endsAt ?? null) : null,
    cooldownDays: cfg.assessmentCooldownDays,
  };
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
  // 0 means not given (an older intake stored a typed "$12,000" as 0).
  const caseValue = opts.caseValueUsd || DEFAULT_CASE_VALUE;
  const monthlyLeads = opts.monthlyLeads || DEFAULT_MONTHLY_LEADS;
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

/** Per-call states for the runner: waiting (connected, transcript not in yet) →
 * scoring (captured, awaiting the score) → scored. Only a call that actually
 * connected counts: a try that never got going (network), one given up on, or
 * one too short to score (all FAILED) doesn't use up the free call. `attempts`
 * is every try; `tooShort` says the latest one was too short to score. */
export async function auditCallCounts(auditId: string) {
  const sessions = await prisma.session.findMany({
    where: { auditId },
    orderBy: { startedAt: "asc" },
    select: { status: true, personaSeed: true, evaluation: { select: { scoredAt: true } } },
  });
  const counted = sessions.filter((s) => s.status !== "FAILED" && (s.evaluation || auditCallConnected(s.personaSeed)));
  const calls: AuditCallState[] = counted.map((s) =>
    !s.evaluation ? "waiting" : s.evaluation.scoredAt ? "scored" : "scoring"
  );
  const last = sessions[sessions.length - 1];
  const tooShort = last?.status === "FAILED" && (last.personaSeed as Record<string, unknown> | null)?.failReason === "too-short";
  return {
    total: counted.length,
    scored: calls.filter((c) => c === "scored").length,
    calls,
    attempts: sessions.length,
    attemptsLeft: Math.max(0, AUDIT_MAX_ATTEMPTS - sessions.length),
    tooShort,
  };
}

/** Whether an audit call reached the lead (set by /api/audit/:id/live). */
export function auditCallConnected(seed: unknown): boolean {
  return Boolean((seed as Record<string, unknown> | null)?.connectedAt);
}

/** Tries at the free call before we stop and ask them to get in touch. */
export const AUDIT_MAX_ATTEMPTS = 4;

/** Compute + persist the report once the trial call is scored. Idempotent. */
export async function finalizeAudit(auditId: string) {
  const audit = await prisma.setterAudit.findUnique({ where: { id: auditId } });
  if (!audit) return null;

  // A call too short to score is closed out as FAILED (lib/ingest): it's not
  // part of the report, and the prospect calls again.
  const sessions = await prisma.session.findMany({
    where: { auditId, status: { not: "FAILED" }, evaluation: { scoredAt: { not: null } } },
    include: { evaluation: { omit: { rawPayload: true }, include: { skills: true } } },
    orderBy: { startedAt: "asc" },
  });
  if (sessions.length < AUDIT_CALLS) return null; // not all scored yet

  const overalls = sessions.map((s) => Number(s.evaluation!.overallScore ?? 0));
  const overall = overalls.reduce((a, b) => a + b, 0) / overalls.length;
  // Real booking outcome (from the scorer), not inferred from the score.
  const bookedCount = sessions.filter((s) => s.evaluation!.booked === true).length;

  // skill averages across the scored calls
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
    where: { auditId, status: { not: "FAILED" }, evaluation: { scoredAt: { not: null } } },
    include: { evaluation: { omit: { rawPayload: true }, include: { skills: true } } },
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

  // Real published trainings to showcase what's inside the platform — prefer ones
  // targeting this prospect's weak skills, fall back to any published setter training.
  const leakKeys = leaks.map((l) => l.key);
  let exampleRows = leakKeys.length
    ? await prisma.training.findMany({ where: { status: "PUBLISHED", category: "SETTER", targetSkillKey: { in: leakKeys } }, select: { id: true, title: true, type: true, length: true, targetSkillKey: true }, take: 6 })
    : [];
  if (exampleRows.length === 0) {
    exampleRows = await prisma.training.findMany({ where: { status: "PUBLISHED", category: "SETTER" }, select: { id: true, title: true, type: true, length: true, targetSkillKey: true }, take: 6 });
  }
  const trainingExamples = exampleRows.map((t) => ({
    id: t.id,
    title: t.title,
    type: t.type as "VIDEO" | "WORKBOOK",
    length: t.length,
    skill: t.targetSkillKey ? skillName(t.targetSkillKey) : "All skills",
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
    trainingExamples,
    baselineAt: audit.baselineAt,
  };
}
