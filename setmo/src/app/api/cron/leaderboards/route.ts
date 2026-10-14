import { json, error } from "@/lib/api";
import { cronAuthorized } from "@/lib/cron-auth";
import { recomputeGlobalLeaderboard } from "@/lib/leaderboard";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// GET /api/cron/leaderboards — every 15 minutes: rebuild the platform-wide board
// (offices ranked by average score). Each office's own board still updates
// after every scored call; this one spans every customer, so it runs here.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return error("Unauthorized", 401);
  await recomputeGlobalLeaderboard();
  return json({ ok: true });
}
