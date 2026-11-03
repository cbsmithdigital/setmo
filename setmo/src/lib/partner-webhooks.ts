import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { captureError } from "@/lib/observability";
import { serializePartnerSession } from "@/lib/partner-serialize";
import type { PartnerMode } from "@/generated/prisma/client";

// ===========================================================================
// PARTNER WEBHOOKS — SetMo tells a partner's server what happened to a call it
// started: session.started (the call connected), session.ended (hung up),
// session.completed (scored — the results) and session.failed (with a reason).
//
// Each event is stored once per call and type (so firing twice is harmless),
// sent right away, and retried with backoff for about a day. Every attempt is
// signed:  X-Setmo-Signature: sha256=HMAC_SHA256(secret, "<timestamp>.<body>")
// with the timestamp in X-Setmo-Timestamp (unix seconds), so the partner can
// check it came from SetMo and is fresh. X-Setmo-Event-Id stays the same across
// retries — the partner dedupes on it.
// ===========================================================================

export type PartnerEventType = "session.started" | "session.ended" | "session.completed" | "session.failed";

// Waits after each failed attempt: 1m, 5m, 15m, 1h, 3h, 6h, 12h — then it's
// marked FAILED (still re-sendable from the console).
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 3600_000, 6 * 3600_000, 12 * 3600_000];
const TIMEOUT_MS = 10_000;
// While one sender is mid-attempt, nobody else picks the event up.
const CLAIM_MS = 30_000;

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Record an event for a partner call and try to send it now. Safe to call for
 *  any session: calls not started through a partner are ignored, and each type
 *  is recorded once per call. Never throws. */
export async function emitSessionEvent(sessionId: string, type: PartnerEventType): Promise<void> {
  try {
    const s = await prisma.session.findUnique({ where: { id: sessionId }, select: { partnerId: true, partnerMode: true } });
    if (!s?.partnerId || !s.partnerMode) return;
    // The recording link is minted when each attempt is sent (it expires), so
    // the stored payload never carries one.
    const session = await serializePartnerSession(sessionId);
    if (!session) return;
    const id = "evt_" + randomUUID().replace(/-/g, "");
    try {
      await prisma.partnerWebhookDelivery.create({
        data: {
          id,
          partnerId: s.partnerId,
          mode: s.partnerMode,
          sessionId,
          type,
          payload: { id, object: "event", type, created: new Date().toISOString(), mode: session.mode, data: { session } } as object,
          nextAttemptAt: new Date(),
        },
      });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") return; // already recorded
      throw e;
    }
    await deliver(id);
  } catch (e) {
    captureError(e, { scope: "partner-webhook-emit", sessionId, type });
  }
}

type Attempt = { delivered: boolean; status?: number; error?: string };

/** One delivery attempt. Updates the event's status and schedules the next try. */
export async function deliver(id: string, opts: { force?: boolean } = {}): Promise<Attempt> {
  const now = new Date();
  // Claim it, so the sweep and an emit (or two sweeps) never send it twice at once.
  const claim = await prisma.partnerWebhookDelivery.updateMany({
    where: {
      id,
      ...(opts.force ? {} : { status: "PENDING" }),
      OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(now.getTime() - CLAIM_MS) } }],
    },
    data: { lastAttemptAt: now },
  });
  if (claim.count === 0) return { delivered: false, error: "already being sent" };

  const d = await prisma.partnerWebhookDelivery.findUniqueOrThrow({ where: { id } });
  const integration = await prisma.partnerIntegration.findUnique({ where: { partnerId_mode: { partnerId: d.partnerId, mode: d.mode } } });
  if (!integration?.webhookUrl) {
    await prisma.partnerWebhookDelivery.update({ where: { id }, data: { status: "SKIPPED", nextAttemptAt: null, lastError: "No webhook URL set" } });
    return { delivered: false, error: "No webhook URL set" };
  }

  // A fresh recording link for completed calls.
  const payload = d.payload as { data?: { session?: { id?: string; status?: string; recording?: unknown } } };
  const sessionStatus = payload.data?.session?.status;
  if (d.sessionId && (d.type === "session.completed" || (d.type === "session.failed" && sessionStatus === "failed"))) {
    const fresh = await serializePartnerSession(d.sessionId, { recording: true }).catch(() => null);
    if (fresh?.recording && payload.data?.session) payload.data.session.recording = fresh.recording;
  }
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);

  let attempt: Attempt;
  try {
    const res = await fetch(integration.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "SetMo-Webhooks/1.0",
        "x-setmo-event-id": d.id,
        "x-setmo-event-type": d.type,
        "x-setmo-timestamp": String(timestamp),
        "x-setmo-signature": signWebhook(integration.webhookSecret, timestamp, body),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    attempt = res.status >= 200 && res.status < 300 ? { delivered: true, status: res.status } : { delivered: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (e) {
    attempt = { delivered: false, error: e instanceof Error ? (e.name === "TimeoutError" ? "Timed out after 10s" : e.message).slice(0, 300) : "Request failed" };
  }

  const attempts = d.attempts + 1;
  if (attempt.delivered) {
    await prisma.partnerWebhookDelivery.update({
      where: { id },
      data: { status: "DELIVERED", attempts, lastStatus: attempt.status ?? null, lastError: null, deliveredAt: new Date(), nextAttemptAt: null },
    });
  } else {
    const wait = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
    const giveUp = attempts > BACKOFF_MS.length;
    await prisma.partnerWebhookDelivery.update({
      where: { id },
      data: {
        status: giveUp ? "FAILED" : "PENDING",
        attempts,
        lastStatus: attempt.status ?? null,
        lastError: attempt.error ?? null,
        nextAttemptAt: giveUp ? null : new Date(Date.now() + wait),
      },
    });
  }
  return attempt;
}

/** Re-send an event now (from the console), whatever its state. */
export async function redeliver(id: string): Promise<Attempt> {
  await prisma.partnerWebhookDelivery.update({ where: { id }, data: { status: "PENDING", lastAttemptAt: null } });
  return deliver(id, { force: true });
}

/** The retry sweep (cron every 5 minutes). */
export async function sweepPartnerWebhooks(budgetMs = 120_000): Promise<{ attempted: number; delivered: number }> {
  const started = Date.now();
  const due = await prisma.partnerWebhookDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: 50,
    select: { id: true },
  });
  let attempted = 0;
  let delivered = 0;
  for (const d of due) {
    if (Date.now() - started > budgetMs) break;
    attempted++;
    const r = await deliver(d.id).catch(() => ({ delivered: false }));
    if (r.delivered) delivered++;
  }
  return { attempted, delivered };
}

// A partner call that was created but never started — the trainee closed the
// frame, or the launch link was never opened. After a day it's closed out as
// failed ("abandoned") so the partner's attempt doesn't hang open forever.
const ABANDON_AFTER_MS = 24 * 3600_000;

export async function closeAbandonedPartnerCalls(): Promise<number> {
  const stale = await prisma.session.findMany({
    where: { partnerId: { not: null }, status: "CREATED", startedAt: { lt: new Date(Date.now() - ABANDON_AFTER_MS) } },
    select: { id: true, personaSeed: true },
    take: 200,
  });
  let closed = 0;
  for (const s of stale) {
    const seed = (s.personaSeed ?? {}) as Record<string, unknown>;
    const r = await prisma.session.updateMany({
      where: { id: s.id, status: "CREATED" },
      data: { status: "FAILED", personaSeed: { ...seed, failReason: "abandoned", failedAt: new Date().toISOString() } as object },
    });
    if (r.count === 1) {
      closed++;
      await emitSessionEvent(s.id, "session.failed");
    }
  }
  return closed;
}

/** For the console: the mode's events, newest first. */
export async function recentDeliveries(partnerId: string, mode: PartnerMode, take = 25) {
  return prisma.partnerWebhookDelivery.findMany({ where: { partnerId, mode }, orderBy: { createdAt: "desc" }, take });
}
