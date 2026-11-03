import { z } from "zod";
import { partnerRoute, apiJson, apiError, readJson, zodMessage, EXTERNAL_ID } from "@/lib/partner-http";
import { externalIds, findTrainee, upsertTrainee } from "@/lib/partner-api";
import { TraineeFields } from "@/lib/partner-sessions";
import { serializeTrainee } from "@/lib/partner-serialize";

export const dynamic = "force-dynamic";

const Body = TraineeFields.extend({ location_id: z.string().regex(EXTERNAL_ID).optional() });

async function traineeObject(caller: { partnerId: string; mode: "LIVE" | "TEST" }, id: string) {
  const u = await findTrainee(caller, id);
  if (!u) return null;
  const ids = await externalIds(caller.partnerId, caller.mode, { officeIds: u.officeId ? [u.officeId] : [] });
  return serializeTrainee(id, caller.mode, u, u.officeId ? ids.office.get(u.officeId) ?? null : null);
}

// GET /api/v1/trainees/:id — one of the partner's trainees, by the partner's id.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return partnerRoute(req, async (caller) => {
    const { id } = await params;
    const t = EXTERNAL_ID.test(id) ? await traineeObject(caller, id) : null;
    if (!t) return apiError(404, "trainee_not_found", `No trainee with id "${id}".`);
    return apiJson(t);
  });
}

// PUT /api/v1/trainees/:id — create the trainee (location_id required) or update
// the name / move them to another of the partner's locations. Trainees have no
// SetMo login and get no SetMo email.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return partnerRoute(req, async (caller) => {
    const { id } = await params;
    if (!EXTERNAL_ID.test(id)) return apiError(422, "invalid_request", "Trainee ids use 1–100 letters, digits, or . _ : -");
    const body = await readJson(req);
    if (!body.ok) return body.res;
    const parsed = Body.safeParse(body.body);
    if (!parsed.success) return apiError(422, "invalid_request", zodMessage(parsed.error.issues));
    const r = await upsertTrainee(caller, id, {
      firstName: parsed.data.first_name,
      lastName: parsed.data.last_name,
      locationExternalId: parsed.data.location_id,
    });
    if (!r.ok) return apiError(r.status, r.code, r.message);
    const t = await traineeObject(caller, id);
    if (!t) return apiError(500, "server_error", "The trainee was saved but couldn't be read back.");
    return apiJson(t, r.created ? 201 : 200);
  });
}
