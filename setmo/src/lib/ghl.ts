import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { scoreLiveTranscript, isScorerConfigured, type ScoreTurn, type LiveOutcome } from "@/lib/scorer";
import { recomputeRecommendations } from "@/lib/coaching";

// ============================================================================
// GHL LIVE-CALL ingestion. The client's GHL sub-account pushes completed-call
// webhooks (locationId, userId, contactId, flat transcript — no contact PII) to
// /api/webhooks/ghl. We scrub → diarize/repair → score with the live rubric +
// outcome taxonomy → store a LIVE session that surfaces to managers, feeds
// training recommendations, and stays OUT of practice analytics + all metering.
// ============================================================================

// Scrubbed transcript text is purged after this many days (scores kept forever).
export const LIVE_TRANSCRIPT_RETENTION_DAYS = 60;

const PREP_MODEL = process.env.SETMO_GHL_PREP_MODEL || "claude-haiku-4-5";

export const LIVE_DISPOSITION_LABEL: Record<string, string> = {
  booked: "Booked",
  soft_booked: "Soft booked",
  callback_agreed: "Callback agreed",
  follow_up_needed: "Follow-up needed",
  declined: "Declined",
  not_a_fit: "Not a fit",
  no_contact: "No contact",
};

export const LIVE_BLOCKER_LABEL: Record<string, string> = {
  price: "Price",
  fear: "Fear / anxiety",
  timing: "Timing",
  decision_maker: "Decision-maker",
  trust: "Trust / skepticism",
  misunderstanding: "Misunderstood offer",
  needs_more_info: "Needs more info",
  setter_error: "Setter error",
  none: "—",
};

export const LIVE_LEAD_STATE_LABEL: Record<string, string> = {
  frustrated: "Frustrated",
  nervous: "Nervous",
  busy: "Busy / rushed",
  confused: "Confused",
  price_shocked: "Price-shocked",
  skeptical: "Skeptical",
  hesitant_interested: "Hesitant but interested",
  eager: "Eager",
};

// ---------------------------------------------------------------------------
// PII scrubbing — regex pass (defense-in-depth; the LLM pre-pass catches names).
// Applied to the raw webhook BEFORE anything is stored.
// ---------------------------------------------------------------------------
export function regexScrubPII(text: string): string {
  return text
    // emails
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    // US phone numbers in common shapes
    .replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[PHONE]")
    // SSN-looking
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]")
    // long card-like digit runs
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[NUMBER]");
}

/** Deep-scrub every STRING value in a JSON-ish structure. Never touches numbers
 *  or keys, so the result is always valid JSON (scrubbing a stringified payload
 *  would corrupt bare numeric literals like ms-epochs into invalid tokens). */
export function scrubJsonStrings<T>(value: T): T {
  if (typeof value === "string") return regexScrubPII(value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubJsonStrings(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubJsonStrings(v);
    return out as T;
  }
  return value;
}

// Contact-identity keys stripped from the payload root and any nested contact-ish
// blocks (snake_case + camelCase + common GHL contact fields).
const IDENTITY_KEYS = /^(first_?name|last_?name|full_?name|contact_?name|name|email|phone|full_?address|address1?|city|state|country|postal_?code|date_?of_?birth|dob|contact|attributionSource)$/i;

/** Strip contact-identity fields from a webhook payload (belt & suspenders —
 *  clients are told to remove them from the workflow, but never trust that). */
export function stripContactIdentity(payload: Record<string, unknown>): Record<string, unknown> {
  const p = { ...payload };
  for (const k of Object.keys(p)) {
    if (IDENTITY_KEYS.test(k)) delete p[k];
  }
  const cd = p.customData as Record<string, unknown> | undefined;
  if (cd) {
    const cleaned = { ...cd };
    for (const k of Object.keys(cleaned)) {
      // keep the transcript + call meta; drop anything identity-shaped a client
      // workflow might have mapped in (contact_name, name, lead_email, dob…)
      if (IDENTITY_KEYS.test(k) || /(^|_)(contact|lead|patient)_?(name|email|phone|address|dob)/i.test(k)) delete cleaned[k];
    }
    p.customData = cleaned;
  }
  // location: keep only the id (its name/address are business info but unneeded)
  const loc = p.location as Record<string, unknown> | undefined;
  if (loc) p.location = { id: loc.id };
  // user: staff identity — keep only the id; the email is captured separately
  // into GhlInboundEvent.ghlUserEmail BEFORE scrubbing (it drives auto-mapping).
  const u = p.user as Record<string, unknown> | undefined;
  if (u) p.user = { id: u.id };
  return p;
}

// ---------------------------------------------------------------------------
// Diarization + cleanup pre-pass. GHL's workflow pushes ONE flat transcript
// string: no speaker labels, with speech-to-text errors. A small model splits it
// into SETTER / LEAD turns, conservatively repairs obvious mis-transcriptions,
// drops dialer/system lines, and redacts any spoken PII to tokens.
// ---------------------------------------------------------------------------
const PrepZ = z.object({
  turns: z.array(z.object({ speaker: z.enum(["setter", "lead", "system"]), text: z.string() })),
  quality: z.enum(["good", "fair", "poor"]),
});

export async function prepareLiveTranscript(opts: {
  flatText: string;
  setterFirstName?: string | null;
  officeName?: string | null;
}): Promise<{ turns: ScoreTurn[]; quality: "good" | "fair" | "poor" } | null> {
  if (!isScorerConfigured()) return null;
  const client = new Anthropic();

  const system = `You prepare a raw phone-call transcript for scoring. The input is ONE flat block of machine speech-to-text from a REAL call between a dental appointment SETTER${
    opts.setterFirstName ? ` (first name: ${opts.setterFirstName})` : ""
  }${opts.officeName ? ` calling on behalf of ${opts.officeName}` : ""} and a prospective patient (LEAD). It has no speaker labels and contains transcription errors.

Your job:
1. Split it into turns and label each speaker: "setter" (the caller working for the practice), "lead" (the prospective patient), or "system" (dialer/IVR lines like "Please stay on the line", "Calling…"). Use content to attribute: the setter introduces themselves/the practice, asks discovery questions, and drives toward booking; the lead answers, describes their dental situation, raises objections.
2. Conservatively repair OBVIOUS speech-to-text errors where the intended word is clear from context. Never invent content; if a fragment is unintelligible, keep it as-is.
3. Redact spoken personal information to tokens: any person's name EXCEPT the setter's first name → [NAME]; phone numbers → [PHONE]; emails → [EMAIL]; street addresses → [ADDRESS]; dates of birth → [DOB].
4. quality: "good" (clean, confidently attributed), "fair" (some garbling but gradable), "poor" (heavily garbled — attribution or content is guesswork).

Split at natural speaker changes; keep each turn's text faithful otherwise.`;

  try {
    const res = await client.messages.parse({
      model: PREP_MODEL,
      max_tokens: 8000,
      // NB: Haiku doesn't support the `effort` param — omit it here.
      output_config: { format: zodOutputFormat(PrepZ) },
      system,
      messages: [{ role: "user", content: `Raw transcript:\n${opts.flatText}` }],
    });
    const o = res.parsed_output;
    if (!o) return null;

    // Estimated timings from cumulative word count (~2.4 words/sec spoken).
    let t = 0;
    const turns: ScoreTurn[] = [];
    for (const turn of o.turns) {
      if (turn.speaker === "system" || !turn.text.trim()) continue;
      turns.push({ speaker: turn.speaker === "setter" ? "you" : "lead", text: turn.text.trim(), t: Math.round(t) });
      t += turn.text.split(/\s+/).length / 2.4;
    }
    return { turns, quality: o.quality };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The ingest pipeline: webhook event row → mapped setter → prep → score → LIVE
// session. Never throws (status lands on the event row).
// ---------------------------------------------------------------------------
export async function processGhlInbound(eventId: string): Promise<void> {
  // Atomically CLAIM the event so concurrent invocations (double-click replay,
  // webhook + replay racing) can never double-process it into two sessions.
  const claimed = await prisma.ghlInboundEvent.updateMany({
    where: { id: eventId, status: { in: ["RECEIVED", "UNMAPPED_USER", "ERROR"] } },
    data: { status: "PROCESSING" },
  });
  if (claimed.count !== 1) return; // already processed / being processed / terminal

  const event = await prisma.ghlInboundEvent.findUnique({
    where: { id: eventId },
    include: { integration: { include: { office: { select: { id: true, name: true, city: true, offerFraming: true, organizationId: true, servedByPod: { select: { organizationId: true } } } } } } },
  });
  if (!event) return;
  const fail = (status: string, note: string) =>
    prisma.ghlInboundEvent.update({ where: { id: eventId }, data: { status, note } }).then(() => undefined);

  try {
    const office = event.integration.office;
    const payload = event.payload as { customData?: { transcript?: string } };

    // --- resolve the setter (GHL user → SetMo user) ---
    let setterId: string | null = null;
    if (event.ghlUserId) {
      const map = await prisma.ghlUserMap.findUnique({ where: { ghlUserId: event.ghlUserId } });
      setterId = map?.userId ?? null;
    }
    if (!setterId) {
      // auto-map by the GHL STAFF user's email (captured pre-scrub on the event
      // row), verified against this office's people
      const email = event.ghlUserEmail?.toLowerCase();
      const candidate = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, officeId: true, organizationId: true, callCenterPodId: true } }) : null;
      if (candidate) {
        const assigned = await prisma.agentOffice.findUnique({ where: { userId_officeId: { userId: candidate.id, officeId: office.id } } }).catch(() => null);
        const sameOrg = Boolean(candidate.organizationId && (candidate.organizationId === office.organizationId || candidate.organizationId === office.servedByPod?.organizationId));
        if (candidate.officeId === office.id || assigned || sameOrg) {
          setterId = candidate.id;
          if (event.ghlUserId) {
            await prisma.ghlUserMap.upsert({ where: { ghlUserId: event.ghlUserId }, update: { userId: candidate.id }, create: { ghlUserId: event.ghlUserId, userId: candidate.id } }).catch(() => {});
          }
        }
      }
    }
    if (!setterId) return await fail("UNMAPPED_USER", `No SetMo user for GHL user ${event.ghlUserId ?? "(none)"} / ${event.ghlUserEmail ?? "no email"} — map them in Platform → GHL, then this call reprocesses.`);

    // --- transcript gates ---
    const flat = (payload.customData?.transcript ?? "").trim();
    if (!flat || flat.split(/\s+/).length < 40) return await fail("TOO_SHORT", "Transcript missing or under ~40 words.");

    const setter = await prisma.user.findUnique({ where: { id: setterId }, select: { firstName: true, organizationId: true, callCenterPodId: true } });
    const prep = await prepareLiveTranscript({ flatText: flat, setterFirstName: setter?.firstName, officeName: office.name });
    if (!prep || prep.turns.length === 0) return await fail("ERROR", "Diarization pre-pass failed.");
    const setterTurns = prep.turns.filter((x) => x.speaker === "you").length;
    if (setterTurns < 2) return await fail("TOO_SHORT", "Fewer than 2 setter turns after diarization.");

    const words = prep.turns.reduce((a, x) => a + x.text.split(/\s+/).length, 0);
    const durationSeconds = Math.max(30, Math.round(words / 2.4));

    // --- score ---
    const score = await scoreLiveTranscript({ turns: prep.turns, durationSeconds, office, setterFirstName: setter?.firstName });
    if (!score) return await fail("ERROR", "Live scoring failed.");
    // Pre-pass quality caps the reported confidence (worst-of wins).
    const rank = { good: 0, fair: 1, poor: 2 } as const;
    const outcome: LiveOutcome = { ...score.outcome, transcriptQuality: rank[prep.quality] > rank[score.outcome.transcriptQuality] ? prep.quality : score.outcome.transcriptQuality };

    // --- persist the LIVE session (kept out of practice analytics + metering) ---
    const startedAt = new Date(Date.now() - durationSeconds * 1000);
    const rawPayload = {
      source: "ghl",
      prepQuality: prep.quality,
      data: { transcript: prep.turns.map((x) => ({ role: x.speaker === "you" ? "user" : "agent", message: x.text, time_in_call_secs: x.t })) },
    };

    await prisma.$transaction(async (tx) => {
      const s = await tx.session.create({
        data: {
          setterId: setterId!,
          officeId: office.id,
          // CC agents: attribute to their center so managers' view-ACL works.
          // Metering everywhere excludes kind LIVE, so no pool is drawn.
          callCenterOrgId: setter?.callCenterPodId ? setter.organizationId : null,
          serviceType: "IMPLANT",
          kind: "LIVE",
          status: "SCORED",
          startedAt,
          completedAt: new Date(),
          durationSeconds,
          personaSeed: { live: true, persona: `Live call · ${LIVE_DISPOSITION_LABEL[outcome.disposition] ?? outcome.disposition}`, ghlContactId: event.ghlContactId, ghlUserId: event.ghlUserId },
        },
      });
      const e = await tx.evaluation.create({
        data: {
          sessionId: s.id,
          overallScore: score.overallScore,
          narrative: score.narrative,
          wins: score.wins,
          misses: score.misses,
          replacementPhrases: score.phrases,
          personaCoaching: score.personaCoaching,
          recommendedNextScenario: score.recommendedNextScenario,
          rawPayload,
          booked: score.booked,
          liveOutcome: outcome as object,
          scoredAt: new Date(),
        },
      });
      await tx.skillScore.createMany({ data: score.skills.map((k) => ({ evaluationId: e.id, skillKey: k.skillKey, tier: k.tier, score: k.score, reasoning: k.reasoning })) });
      // Stamp PROCESSED inside the SAME transaction as the session (so a crash
      // can never leave a committed session with a replayable event), and drop
      // the flat transcript from the stored payload — the redacted, diarized
      // copy on the Evaluation is now the only stored transcript.
      const storedPayload = { ...(event.payload as Record<string, unknown>) };
      const cd = storedPayload.customData as Record<string, unknown> | undefined;
      if (cd) storedPayload.customData = { ...cd, transcript: "[processed → evaluation]" };
      await tx.ghlInboundEvent.update({
        where: { id: eventId },
        data: { status: "PROCESSED", sessionId: s.id, note: null, payload: storedPayload as import("@/generated/prisma/client").Prisma.InputJsonValue },
      });
      return s;
    });

    // Live calls feed TRAINING RECOMMENDATIONS (real weaknesses = best signal)
    // but not memory/leaderboards/goals/metering — those stay practice-only.
    await recomputeRecommendations(setterId).catch(() => {});
    await prisma.ghlIntegration.update({ where: { id: event.integrationId }, data: { lastCallAt: new Date() } }).catch(() => {});
  } catch (e) {
    await fail("ERROR", e instanceof Error ? e.message.slice(0, 400) : "Unknown error");
  }
}

/** After the super-admin maps a GHL user, replay their held calls. */
export async function reprocessUnmappedFor(ghlUserId: string): Promise<number> {
  const held = await prisma.ghlInboundEvent.findMany({ where: { ghlUserId, status: "UNMAPPED_USER" }, select: { id: true } });
  for (const h of held) await processGhlInbound(h.id);
  return held.length;
}

// ---------------------------------------------------------------------------
// Manager surfaces: list live calls for a set of offices (office admin) or a
// call-center scope (all agents in the org / one pod).
// ---------------------------------------------------------------------------
export type LiveCallRow = {
  id: string;
  setterName: string;
  officeName: string;
  when: Date;
  durationSeconds: number;
  score: number;
  disposition: string;
  primaryBlocker: string;
  leadStates: string[];
  lowConfidence: boolean;
  booked: boolean;
};

export async function getLiveCalls(where: { officeIds?: string[]; callCenterOrgId?: string; podId?: string }, take = 50): Promise<LiveCallRow[]> {
  const sessions = await prisma.session.findMany({
    where: {
      kind: "LIVE",
      status: "SCORED",
      evaluation: { isNot: null },
      ...(where.officeIds ? { officeId: { in: where.officeIds } } : {}),
      ...(where.callCenterOrgId ? { callCenterOrgId: where.callCenterOrgId } : {}),
      ...(where.podId ? { setter: { callCenterPodId: where.podId } } : {}),
    },
    orderBy: { startedAt: "desc" },
    take,
    select: {
      id: true,
      startedAt: true,
      durationSeconds: true,
      setter: { select: { firstName: true, lastName: true } },
      office: { select: { name: true } },
      evaluation: { select: { overallScore: true, booked: true, liveOutcome: true } },
    },
  });
  return sessions.map((s) => {
    const o = (s.evaluation?.liveOutcome ?? {}) as Partial<LiveOutcome>;
    return {
      id: s.id,
      setterName: [s.setter?.firstName, s.setter?.lastName].filter(Boolean).join(" ") || "Setter",
      officeName: s.office?.name ?? "",
      when: s.startedAt,
      durationSeconds: s.durationSeconds ?? 0,
      score: s.evaluation?.overallScore != null ? Number(s.evaluation.overallScore) : 0,
      disposition: LIVE_DISPOSITION_LABEL[o.disposition ?? ""] ?? "—",
      primaryBlocker: o.primaryBlocker && o.primaryBlocker !== "none" ? (LIVE_BLOCKER_LABEL[o.primaryBlocker] ?? o.primaryBlocker) : "",
      leadStates: (o.leadStates ?? []).map((l) => LIVE_LEAD_STATE_LABEL[l.state] ?? l.state),
      lowConfidence: o.transcriptQuality === "poor",
      booked: Boolean(s.evaluation?.booked),
    };
  });
}
