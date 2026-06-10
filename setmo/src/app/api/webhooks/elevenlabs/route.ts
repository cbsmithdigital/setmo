import { verifyWebhookSignature } from "@/lib/elevenlabs";
import { ingestPostCall, ingestAudio } from "@/lib/ingest";
import { error, json } from "@/lib/api";

// Allow up to 60s — the transcript scorer (Claude) runs inline. Idempotent, so
// a retry after a slow first response just no-ops.
export const maxDuration = 60;

// POST /api/webhooks/elevenlabs — the authoritative, server-side score capture.
// This is the ONLY path that writes scores + durations. The browser is never
// trusted (leaderboards depend on this).
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

  const type = (payload as { type?: string })?.type;

  // The recording arrives as a separate `post_call_audio` event (zero-retention
  // account streams the audio inline). Store it; don't run scoring.
  if (type === "post_call_audio") {
    const result = await ingestAudio(payload);
    return json({ received: true, kind: "audio", ...result });
  }

  // Default: the transcription event — the authoritative scoring path.
  const result = await ingestPostCall(payload);

  // Always 200 once verified so ElevenLabs doesn't retry a non-actionable event.
  return json({ received: true, kind: "transcription", ...result });
}
