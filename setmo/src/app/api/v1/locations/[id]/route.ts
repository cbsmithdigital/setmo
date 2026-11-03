import { partnerRoute, apiJson, apiError, readJson, zodMessage, EXTERNAL_ID } from "@/lib/partner-http";
import { findLocation, upsertLocation } from "@/lib/partner-api";
import { LocationFields, locationInput } from "@/lib/partner-sessions";
import { serializeLocation } from "@/lib/partner-serialize";

export const dynamic = "force-dynamic";

// GET /api/v1/locations/:id — one of the partner's locations, by the partner's id.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return partnerRoute(req, async (caller) => {
    const { id } = await params;
    if (!EXTERNAL_ID.test(id)) return apiError(404, "location_not_found", `No location with id "${id}".`);
    const office = await findLocation(caller, id);
    if (!office) return apiError(404, "location_not_found", `No location with id "${id}".`);
    return apiJson(serializeLocation(id, caller.mode, office));
  });
}

// PUT /api/v1/locations/:id — create the location (name required) or update the
// fields sent. `call_types` sets exactly which call types it runs.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return partnerRoute(req, async (caller) => {
    const { id } = await params;
    if (!EXTERNAL_ID.test(id)) return apiError(422, "invalid_request", "Location ids use 1–100 letters, digits, or . _ : -");
    const body = await readJson(req);
    if (!body.ok) return body.res;
    const parsed = LocationFields.safeParse(body.body);
    if (!parsed.success) return apiError(422, "invalid_request", zodMessage(parsed.error.issues));
    const r = await upsertLocation(caller, id, locationInput(parsed.data));
    if (!r.ok) return apiError(r.status, r.code, r.message);
    const office = await findLocation(caller, id);
    if (!office) return apiError(500, "server_error", "The location was saved but couldn't be read back.");
    return apiJson(serializeLocation(id, caller.mode, office), r.created ? 201 : 200);
  });
}
