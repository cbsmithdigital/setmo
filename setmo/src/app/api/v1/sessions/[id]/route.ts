import { partnerRoute, apiJson, apiError } from "@/lib/partner-http";
import { partnerOwnsSession } from "@/lib/partner-sessions";
import { serializePartnerSession } from "@/lib/partner-serialize";

export const dynamic = "force-dynamic";
// A recording that hasn't landed yet is fetched from the voice service.
export const maxDuration = 60;

// GET /api/v1/sessions/:id — the call's state, and its results once scored
// (with a recording link good for an hour).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return partnerRoute(req, async (caller) => {
    const { id } = await params;
    if (!(await partnerOwnsSession(caller, id))) return apiError(404, "session_not_found", `No session with id "${id}".`);
    const session = await serializePartnerSession(id, { recording: true });
    if (!session) return apiError(404, "session_not_found", `No session with id "${id}".`);
    return apiJson(session);
  });
}
