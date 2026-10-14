import { json, error } from "@/lib/api";
import { cronAuthorized } from "@/lib/cron-auth";
import { sweepScoring } from "@/lib/rescore";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/cron/rescore — every 5 minutes: retry practice calls whose score
// didn't land, and close out calls that are out of tries or never sent a
// transcript (marked FAILED, not charged). See lib/rescore.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return error("Unauthorized", 401);
  const result = await sweepScoring();
  return json({ ok: true, ...result });
}
