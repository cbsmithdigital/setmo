import { createHash } from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { scrubJsonStrings, stripContactIdentity, processGhlInbound } from "@/lib/ghl";
import { captureError } from "@/lib/observability";
import { error, json } from "@/lib/api";

export const maxDuration = 300;

// POST /api/webhooks/ghl — a GHL Workflow "Custom Webhook" pushes a completed
// call: { location.id, user, contactId?, customData: { transcript, ... } }.
// Auth = the integration's webhookSecret (?key= or x-setmo-key header). The
// payload is PII-scrubbed BEFORE storage (identity fields dropped + regex scrub);
// scoring runs in the background via after().
export async function POST(req: Request) {
  const raw = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return error("Invalid JSON", 400);
  }

  const location = body.location as { id?: string } | undefined;
  const ghlLocationId = location?.id ?? (body.location_id as string | undefined) ?? null;
  if (!ghlLocationId) return error("Missing location id", 422);

  const integration = await prisma.ghlIntegration.findUnique({ where: { ghlLocationId } });
  if (!integration || integration.status !== "ACTIVE") return error("Unknown or paused integration", 404);

  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? req.headers.get("x-setmo-key");
  if (key !== integration.webhookSecret) return error("Forbidden", 403);

  // Staff identity (drives agent auto-mapping) — captured BEFORE scrubbing,
  // stored in its own column, never in the payload.
  const rawUser = body.user as { id?: string; email?: string } | undefined;
  const ghlUserEmail = typeof rawUser?.email === "string" && rawUser.email.includes("@") ? rawUser.email : null;

  // Scrub BEFORE anything is stored: drop contact-identity fields, then regex-
  // scrub every remaining STRING value (emails/phones/SSN/card-like runs →
  // tokens). Value-walking keeps numbers untouched, so the JSON stays valid.
  const scrubbed = scrubJsonStrings(stripContactIdentity(body));

  const user = scrubbed.user as { id?: string } | undefined;
  const ghlUserId = (user?.id as string | undefined) ?? (scrubbed.user_id as string | undefined) ?? null;
  const ghlContactId = (scrubbed.contact_id as string | undefined) ?? null;
  const transcript = ((scrubbed.customData as { transcript?: string } | undefined)?.transcript ?? "").trim();

  // Idempotency: the same call replayed (workflow re-fires, GHL retries) is a
  // no-op. Create-first so two concurrent deliveries can't both pass a pre-read
  // — the loser's unique-violation IS the duplicate signal.
  const dedupeKey = createHash("sha256").update(`${ghlLocationId}:${ghlContactId ?? ""}:${transcript}`).digest("hex");
  let event: { id: string };
  try {
    event = await prisma.ghlInboundEvent.create({
      data: { integrationId: integration.id, dedupeKey, ghlUserId, ghlUserEmail, ghlContactId, payload: scrubbed as import("@/generated/prisma/client").Prisma.InputJsonValue },
      select: { id: true },
    });
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002") return json({ ok: true, duplicate: true });
    throw e;
  }

  after(async () => {
    try {
      await processGhlInbound(event.id);
    } catch (e) {
      captureError(e, { where: "ghl-webhook-process", eventId: event.id });
    }
  });

  return json({ ok: true });
}
