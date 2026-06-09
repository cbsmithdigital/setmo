// Supabase Edge Function: receive the ElevenLabs `post_call_audio` webhook
// (inline base64 audio, sent because the account is zero-retention) and store
// the recording in the private `recordings` bucket. Runs here instead of Vercel
// because long calls (8+ min) exceed Vercel's ~4.5 MB request-body limit.
//
// Deploy:  supabase functions deploy elevenlabs-audio --no-verify-jwt --project-ref <ref>
// Secret:  supabase secrets set ELEVENLABS_WEBHOOK_SECRET=<secret> --project-ref <ref>
// Webhook: point the ElevenLabs *audio* webhook at
//          https://<ref>.supabase.co/functions/v1/elevenlabs-audio
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET") ?? "";
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

  // This endpoint handles audio only; ignore other event types politely.
  if (payload?.type !== "post_call_audio") {
    return new Response(JSON.stringify({ ignored: true }), { status: 200 });
  }

  const data = (payload.data ?? payload) as Record<string, unknown>;
  const conversationId = (data.conversation_id as string) ?? null;
  const b64 = (data.full_audio as string) ?? (data.audio as string) ?? null;
  if (!conversationId || !b64) return new Response("Missing audio", { status: 400 });

  const bytes = decodeBase64(b64);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Ensure the private bucket exists.
  const { data: bucket } = await supabase.storage.getBucket(BUCKET);
  if (!bucket) await supabase.storage.createBucket(BUCKET, { public: false });

  const path = `${conversationId}.mp3`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (upErr) return new Response(`Upload failed: ${upErr.message}`, { status: 500 });

  // Reference it on the matching session (set at /ended or score capture).
  await supabase.from("session").update({ audio_path: path }).eq("elevenlabs_conversation_id", conversationId);

  return new Response(JSON.stringify({ ok: true, bytes: bytes.length }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
