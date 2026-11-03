import { after } from "next/server";
import { z } from "zod";
import { partnerRoute, apiJson, apiError, readJson, zodMessage } from "@/lib/partner-http";
import { partnerOwnsSession } from "@/lib/partner-sessions";
import { runSimulation, startSimulation } from "@/lib/partner-simulate";
import { serializePartnerSession } from "@/lib/partner-serialize";
import { captureError } from "@/lib/observability";

export const dynamic = "force-dynamic";
// The simulated call runs after the response: ~10 seconds plus webhook sends.
export const maxDuration = 60;

const Body = z.object({ outcome: z.enum(["completed", "too_short", "no_transcript"]).default("completed") }).strict();

// POST /api/v1/sessions/:id/simulate — TEST keys only. Plays a not-yet-started
// session's whole life with a made-up call and score (about 10 seconds), sending
// the same webhooks a real call does. No microphone or voice call needed.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return partnerRoute(req, async (caller) => {
    if (caller.mode !== "TEST") return apiError(403, "test_mode_only", "Simulation works with test keys (setmo_test_…) only.");
    const { id } = await params;
    if (!(await partnerOwnsSession(caller, id))) return apiError(404, "session_not_found", `No session with id "${id}".`);
    const body = await readJson(req);
    if (!body.ok) return body.res;
    const parsed = Body.safeParse(body.body);
    if (!parsed.success) return apiError(422, "invalid_request", zodMessage(parsed.error.issues));

    const refused = await startSimulation(id);
    if (refused) return apiError(409, "session_already_started", refused);
    after(async () => {
      try {
        await runSimulation(id, parsed.data.outcome);
      } catch (e) {
        captureError(e, { scope: "partner-simulate", sessionId: id });
      }
    });
    return apiJson({ ...(await serializePartnerSession(id)), simulating: parsed.data.outcome }, 202);
  });
}
