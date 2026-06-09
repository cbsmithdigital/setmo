// Supabase Edge Function: the SINGLE ElevenLabs post-call webhook endpoint.
// ElevenLabs sends both `post_call_transcription` and `post_call_audio` to one
// URL, and the audio event is inline base64 that exceeds Vercel's ~4.5 MB body
// limit on long calls. So this function receives everything:
//   • post_call_audio        -> store the recording in the `recordings` bucket
//   • everything else (txn)   -> proxy verbatim to the Vercel scoring webhook
//
// Deploy:  supabase functions deploy elevenlabs-webhook --no-verify-jwt --project-ref <ref>
// Secrets: supabase secrets set ELEVENLABS_WEBHOOK_SECRET=<secret> --project-ref <ref>
//          supabase secrets set FORWARD_URL=https://setmo.growdental.ai/api/webhooks/elevenlabs --project-ref <ref>
// Webhook: point the ElevenLabs post-call webhook at
//          https://<ref>.supabase.co/functions/v1/elevenlabs-webhook
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET") ?? "";
const FORWARD_URL =
  Deno.env.get("FORWARD_URL") ?? "https://setmo.growdental.ai/api/webhooks/elevenlabs";
const BUCKET = "recordings";

// Verify ElevenLabs HMAC: header is `t=<unix>,v0=<hex hmac_sha256(t.body)>`.
async function verify(body: string, header: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]),
  );
  const t = parts["t"];
  const v0 = parts["v0"];
  if (!t || !v0) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== v0.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v0.charCodeAt(i);
  return diff === 0;
}

async function storeAudio(payload: Record<string, unknown>): Promise<Response> {
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const conversationId = (data.conversation_id as string) ?? null;
  const b64 = (data.full_audio as string) ?? (data.audio as string) ?? null;
  if (!conversationId || !b64) return new Response("Missing audio", { status: 400 });

  const bytes = decodeBase64(b64);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: bucket } = await supabase.storage.getBucket(BUCKET);
  if (!bucket) await supabase.storage.createBucket(BUCKET, { public: false });

  const path = `${conversationId}.mp3`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (upErr) return new Response(`Upload failed: ${upErr.message}`, { status: 500 });

  await supabase
    .from("session")
    .update({ audio_path: path })
    .eq("elevenlabs_conversation_id", conversationId);

  return new Response(JSON.stringify({ ok: true, kind: "audio", bytes: bytes.length }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// Forward the transcription (or any non-audio) event verbatim to Vercel, which
// verifies the same signature and runs the authoritative scoring pipeline.
async function forward(raw: string, sig: string | null): Promise<Response> {
  const res = await fetch(FORWARD_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(sig ? { "elevenlabs-signature": sig } : {}),
    },
    body: raw,
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const sig = req.headers.get("elevenlabs-signature") ?? req.headers.get("ElevenLabs-Signature");
  if (!(await verify(raw, sig))) return new Response("Invalid signature", { status: 401 });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (payload?.type === "post_call_audio") return storeAudio(payload);
  return forward(raw, sig);
});
