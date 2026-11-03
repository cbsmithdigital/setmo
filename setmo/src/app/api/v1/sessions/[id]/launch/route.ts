import { partnerRoute, apiJson, apiError } from "@/lib/partner-http";
import { partnerOwnsSession } from "@/lib/partner-sessions";
import { mintLaunch } from "@/lib/partner-launch";

export const dynamic = "force-dynamic";

// POST /api/v1/sessions/:id/launch — a fresh launch link for the iframe (each
// link opens once, within 10 minutes). Use it when the frame reloads, or to show
// a finished call's results again.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return partnerRoute(req, async (caller) => {
    const { id } = await params;
    if (!(await partnerOwnsSession(caller, id))) return apiError(404, "session_not_found", `No session with id "${id}".`);
    return apiJson({ object: "launch", ...(await mintLaunch(id, caller.partnerId)) }, 201);
  });
}
