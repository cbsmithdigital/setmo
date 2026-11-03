import { NextResponse } from "next/server";
import { authenticateApiKey, type ApiCaller } from "@/lib/partner-api";
import { withinLimits } from "@/lib/rate-limit";
import { captureError } from "@/lib/observability";

// Plumbing for the Partner API routes (/api/v1): the key check, a per-key rate
// limit, and one error shape — { error: { code, message } } — so a partner's
// code can branch on `code` and show `message`.

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status, headers: { "cache-control": "no-store" } });
}

export function apiJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

// Generous for a server integration; it's a backstop against a runaway loop.
const PER_KEY_PER_MINUTE = 300;

/** Run a Partner API handler: authenticate the key, apply the rate limit, and
 *  turn anything unexpected into a 500 the partner can report. */
export async function partnerRoute(req: Request, handler: (caller: ApiCaller) => Promise<Response>): Promise<Response> {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message);
  const limit = await withinLimits([{ key: `papi:${auth.caller.keyId}`, limit: PER_KEY_PER_MINUTE, windowSeconds: 60 }]);
  if (!limit.ok) {
    const res = apiError(429, "rate_limited", "Too many requests — slow down and retry after the time in Retry-After.");
    res.headers.set("retry-after", String(Math.max(1, limit.retryAfter)));
    return res;
  }
  try {
    return await handler(auth.caller);
  } catch (e) {
    captureError(e, { scope: "partner-api", partnerId: auth.caller.partnerId, url: req.url });
    return apiError(500, "server_error", "Something went wrong on SetMo's side. It's been logged — retry, and tell the SetMo team if it keeps happening.");
  }
}

/** The partner's own ids: letters, digits and . _ : - (1–100 characters). */
export const EXTERNAL_ID = /^[A-Za-z0-9._:-]{1,100}$/;

export async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  const text = await req.text();
  if (!text.trim()) return { ok: true, body: {} };
  if (text.length > 64_000) return { ok: false, res: apiError(413, "payload_too_large", "The request body is over 64 KB.") };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, res: apiError(400, "invalid_json", "The request body isn't valid JSON.") };
  }
}

/** The first problem zod found, as a readable sentence with the field path. */
export function zodMessage(issues: { path: PropertyKey[]; message: string }[]): string {
  const i = issues[0];
  if (!i) return "The request isn't valid.";
  const path = i.path.map(String).join(".");
  return path ? `${path}: ${i.message}` : i.message;
}
