import { partnerRoute, apiJson, apiError, readJson, zodMessage } from "@/lib/partner-http";
import { CreateSessionBody, createPartnerSession } from "@/lib/partner-sessions";
import { withinLimits } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// Creating a call writes a few rows; no model calls happen until the frame opens.
export const maxDuration = 30;

// POST /api/v1/sessions — start a practice call for a trainee. Returns the
// session and a launch link to open in an iframe (good once, for 10 minutes).
// Send `reference` (your attempt id) to make retries safe.
export async function POST(req: Request) {
  return partnerRoute(req, async (caller) => {
    const limit = await withinLimits([{ key: `papi-create:${caller.partnerId}:${caller.mode}`, limit: 120, windowSeconds: 60 }]);
    if (!limit.ok) return apiError(429, "rate_limited", "Too many sessions created this minute — retry shortly.");
    const body = await readJson(req);
    if (!body.ok) return body.res;
    const parsed = CreateSessionBody.safeParse(body.body);
    if (!parsed.success) return apiError(422, "invalid_request", zodMessage(parsed.error.issues));
    const r = await createPartnerSession(caller, parsed.data);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return apiJson(r.body, r.status);
  });
}
