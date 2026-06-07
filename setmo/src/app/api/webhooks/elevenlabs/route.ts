import { parsePostCall, verifyWebhookSignature } from "@/lib/elevenlabs";
import { ingestPostCall } from "@/lib/ingest";
import { error, json } from "@/lib/api";

// POST /api/webhooks/elevenlabs — the authoritative, server-side score capture.
// This is the ONLY path that writes scores + durations. The browser is never
// trusted (leaderboards depend on this).
//
// In production this should verify, enqueue a Trigger.dev job, and return 200
// fast. For v1 the ingestion runs inline (and is idempotent).
export async function POST(req: Request) {
  const raw = await req.text();
  const signature =
    req.headers.get("elevenlabs-signature") ?? req.headers.get("ElevenLabs-Signature");

  if (!process.env.ELEVENLABS_WEBHOOK_SECRET) {
    return error("Webhook secret not configured", 503);
  }
  if (!verifyWebhookSignature(raw, signature)) {
    return error("Invalid signature", 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return error("Invalid JSON", 400);
  }

  const parsed = parsePostCall(payload);
  const result = await ingestPostCall(parsed, payload);

  // Always 200 once verified so ElevenLabs doesn't retry a non-actionable event.
  return json({ received: true, ...result });
}
