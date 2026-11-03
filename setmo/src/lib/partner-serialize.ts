import { prisma } from "@/lib/db";
import { SERVICE_META } from "@/lib/service-meta";
import { packFor } from "@/lib/packs/registry";
import { skillName, skillTier, rubricForEvaluation } from "@/lib/skills";
import { callShowRate } from "@/lib/audit";
import { leadRevealFromSeed } from "@/lib/realism/lead-card";
import { callTokens } from "@/lib/partner-wallet";
import { externalIds } from "@/lib/partner-api";
import { ensureRecording, getRecordingUrl } from "@/lib/storage";
import type { PartnerMode, ServiceKey } from "@/generated/prisma/client";
import type { RevealCheck } from "@/lib/reveal";

// The Partner API's view of a practice call — the same object in API responses
// and webhook payloads. Field names are the public contract (docs/api), so they
// change only additively.

export type PartnerSessionStatus = "created" | "in_progress" | "ended" | "completed" | "failed";
export type PartnerFailureReason = "too_short" | "no_transcript" | "scoring_failed" | "abandoned";

/** What SetMo keeps in Session.partnerMeta. */
export type PartnerMeta = { metadata: Record<string, unknown> | null; createdAt: string };

const FAIL_REASON: Record<string, PartnerFailureReason> = {
  "too-short": "too_short",
  "no-transcript": "no_transcript",
  scoring: "scoring_failed",
  abandoned: "abandoned",
};

const RECORDING_TTL_SECONDS = 3600;

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

function load(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      evaluation: { include: { skills: true } },
      setter: { select: { id: true, firstName: true, lastName: true } },
      office: { select: { id: true, name: true } },
    },
  });
}

/** The call's state as the partner sees it. A call too short to score is a
 *  failure to the partner (no score), though SetMo files it as scored. */
export function partnerStatus(s: Pick<Loaded, "status" | "completedAt" | "personaSeed" | "evaluation">): { status: PartnerSessionStatus; failureReason: PartnerFailureReason | null } {
  const seed = (s.personaSeed ?? {}) as Record<string, unknown>;
  if (s.status === "FAILED") return { status: "failed", failureReason: FAIL_REASON[String(seed.failReason)] ?? "scoring_failed" };
  if (s.status === "SCORED") {
    const e = s.evaluation;
    if (e && e.overallScore == null && e.skills.length === 0) return { status: "failed", failureReason: "too_short" };
    return { status: "completed", failureReason: null };
  }
  if (s.status === "CREATED") return { status: "created", failureReason: null };
  if (s.status === "COMPLETED" || s.completedAt) return { status: "ended", failureReason: null };
  return { status: "in_progress", failureReason: null };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const pct = (score: number) => Math.round((score / 5) * 100);

function result(s: Loaded) {
  const e = s.evaluation;
  if (!e?.scoredAt || (e.overallScore == null && e.skills.length === 0)) return null;
  const order = rubricForEvaluation(e.rubricId).map((k) => k.key);
  const skills = e.skills
    .map((k) => ({ skillKey: k.skillKey, score: Number(k.score), reasoning: k.reasoning }))
    .sort((a, b) => order.indexOf(a.skillKey) - order.indexOf(b.skillKey));
  const score = e.overallScore != null ? Number(e.overallScore) : null;
  const seed = (s.personaSeed ?? null) as Record<string, unknown> | null;
  const lead = leadRevealFromSeed(seed);
  const check = (e.reveal ?? null) as RevealCheck | null;

  const raw = e.rawPayload as { data?: { transcript?: unknown[] } } | null;
  const transcript = ((raw?.data?.transcript ?? []) as { role?: string; message?: string | null; time_in_call_secs?: number }[])
    .filter((t) => typeof t.message === "string" && t.message.trim().length > 0)
    .map((t) => ({ speaker: t.role === "user" ? "trainee" : "lead", text: (t.message as string).trim(), at_seconds: t.time_in_call_secs ?? 0 }));

  return {
    score,
    score_pct: score != null ? pct(score) : null,
    appointment_set: e.booked ?? null,
    likely_to_show_pct: callShowRate(skills),
    summary: e.narrative ?? null,
    skills: skills.map((k) => ({
      key: k.skillKey,
      name: skillName(k.skillKey),
      type: skillTier(k.skillKey) === "universal" ? "universal" : "call_type",
      score: k.score,
      score_pct: pct(k.score),
      note: k.reasoning ?? null,
    })),
    wins: (e.wins as string[] | null) ?? [],
    growth: (e.misses as string[] | null) ?? [],
    phrases: ((e.replacementPhrases as { from: string; to: string }[] | null) ?? []).map((p) => ({ you_said: p.from, try_instead: p.to })),
    coaching: e.personaCoaching ?? null,
    next_step: e.recommendedNextScenario ?? null,
    lead: lead
      ? {
          name: lead.name,
          age: lead.age,
          for_whom: lead.forWhom,
          situation: lead.situation || null,
          real_reason: lead.realReason || null,
          hesitation: lead.hesitation || null,
          tone: lead.tone || null,
          difficulty: lead.difficulty,
        }
      : null,
    reveal: check
      ? {
          found_real_reason: check.why.found,
          found_note: check.why.note || null,
          handled_hesitation: check.hesitation.handled,
          handled_note: check.hesitation.note || null,
        }
      : null,
    transcript,
  };
}

/** The session object. `recording: true` adds a signed link to the recording
 *  (good for an hour), fetching it from the voice service if it hasn't landed. */
export async function serializePartnerSession(sessionId: string, opts: { recording?: boolean } = {}) {
  const s = await load(sessionId);
  if (!s || !s.partnerId || !s.partnerMode) return null;
  const ids = await externalIds(s.partnerId, s.partnerMode, { officeIds: [s.officeId], userIds: [s.setterId] });
  const meta = (s.partnerMeta ?? {}) as Partial<PartnerMeta>;
  const seed = (s.personaSeed ?? {}) as Record<string, unknown>;
  const { status, failureReason } = partnerStatus(s);
  const choice = (seed.choice ?? null) as Record<string, string> | null;

  let recording: { url: string; expires_at: string } | null = null;
  if (opts.recording && (status === "completed" || status === "failed") && s.status !== "FAILED") {
    const path = await ensureRecording(s).catch(() => null);
    const url = path ? await getRecordingUrl(path, RECORDING_TTL_SECONDS).catch(() => null) : null;
    if (url) recording = { url, expires_at: new Date(Date.now() + RECORDING_TTL_SECONDS * 1000).toISOString() };
  }

  return {
    id: s.id,
    object: "session" as const,
    mode: s.partnerMode === "LIVE" ? "live" : "test",
    reference: s.partnerReference,
    metadata: meta.metadata ?? null,
    status,
    failure_reason: failureReason,
    call_type: s.serviceType,
    call_type_name: packFor(s.serviceType)?.name ?? SERVICE_META[s.serviceType as ServiceKey].name,
    challenge: s.difficulty.toLowerCase(),
    lead_choice: choice
      ? { gender: choice.gender ?? null, age: choice.age ?? null, caller: choice.caller ?? null, concern: choice.concern ?? null }
      : null,
    location: { id: ids.office.get(s.officeId) ?? null, name: s.office.name },
    trainee: { id: ids.user.get(s.setterId) ?? null, first_name: s.setter.firstName, last_name: s.setter.lastName },
    created_at: meta.createdAt ?? iso(s.startedAt),
    started_at: status === "created" ? null : iso(s.startedAt),
    ended_at: iso(s.completedAt),
    completed_at: status === "completed" || failureReason === "too_short" ? iso(s.evaluation?.scoredAt) : null,
    duration_seconds: s.durationSeconds ?? null,
    tokens_used: s.status === "FAILED" ? 0 : callTokens(s.durationSeconds),
    result: result(s),
    recording,
  };
}

export type PartnerSessionObject = NonNullable<Awaited<ReturnType<typeof serializePartnerSession>>>;

const modeName = (m: PartnerMode) => (m === "LIVE" ? "live" : "test");

/** The location object. */
export function serializeLocation(
  externalId: string,
  mode: PartnerMode,
  o: {
    name: string;
    city: string | null;
    doctorName: string | null;
    offerFraming: string | null;
    appointmentFraming: string | null;
    depositPolicy: string | null;
    createdAt: Date;
    services: { serviceType: ServiceKey; enabled: boolean }[];
  }
) {
  return {
    id: externalId,
    object: "location" as const,
    mode: modeName(mode),
    name: o.name,
    city: o.city,
    doctor_name: o.doctorName,
    offer: o.offerFraming,
    appointment: o.appointmentFraming,
    deposit: o.depositPolicy,
    call_types: o.services.filter((s) => s.enabled).map((s) => s.serviceType),
    created_at: o.createdAt.toISOString(),
  };
}

/** The trainee object. */
export function serializeTrainee(
  externalId: string,
  mode: PartnerMode,
  u: { firstName: string | null; lastName: string | null; createdAt: Date },
  locationExternalId: string | null
) {
  return {
    id: externalId,
    object: "trainee" as const,
    mode: modeName(mode),
    first_name: u.firstName,
    last_name: u.lastName,
    location_id: locationExternalId,
    created_at: u.createdAt.toISOString(),
  };
}
