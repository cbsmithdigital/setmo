import { uploadRecording } from "@/lib/storage";
import { error, json } from "@/lib/api";

// TEMPORARY diagnostic endpoint for the GHL live-call integration test: captures
// whatever a GHL Workflow "Custom Webhook" action posts and stashes it in the
// private recordings bucket (ghl-test/) so we can inspect the payload shape
// (does it carry the call's messageId?). DELETE after the integration test.
const KEY = "st_ghlprobe_c81f52a7d94e";

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== KEY) return error("Forbidden", 403);

  const body = await req.text();
  let parsed: unknown = body;
  try { parsed = JSON.parse(body); } catch { /* keep raw text */ }
  const headers = Object.fromEntries([...req.headers.entries()].filter(([k]) => !/cookie|authorization/i.test(k)));
  const blob = Buffer.from(JSON.stringify({ receivedAt: new Date().toISOString(), headers, payload: parsed }, null, 2));

  const path = `ghl-test/${Date.now()}.json`;
  await uploadRecording(path, blob, "application/json");
  return json({ ok: true, stored: path });
}
