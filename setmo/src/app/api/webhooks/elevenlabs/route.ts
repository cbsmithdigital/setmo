import { after } from "next/server";
import { verifyWebhookSignature } from "@/lib/elevenlabs";
import { ingestPostCall, ingestAudio, scoreSession } from "@/lib/ingest";
import { error, json } from "@/lib/api";

// The transcript is CAPTURED synchronously (fast, <5s) so the one webhook we get
// on a zero-retention account is never lost; the slow Claude scorer runs in the
// background via after() so we ack ElevenLabs immediately and never hit the
// request timeout. maxDuration covers the background score (a long call ~150s).
export const maxDuration = 300;

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

  // Capture the transcript fast, then score in the background (after the 200).
  const result = await ingestPostCall(payload);
  if (result.needsScore && result.sessionId) {
    const id = result.sessionId;
    after(async () => {
      try {
        await scoreSession(id);
      } catch (e) {
        console.error("scoreSession failed", id, e);
      }
    });
  }

  // Always 200 once verified so ElevenLabs doesn't retry a non-actionable event.
  return json({ received: true, kind: "transcription", ...result });
}
