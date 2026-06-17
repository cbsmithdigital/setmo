import { json, error } from "@/lib/api";
import { sweepGoals } from "@/lib/goals";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/cron/goals — daily sweep: re-evaluate every active goal (catches
// outcome entries, streaks, time windows), expire ended goals, and roll monthly
// recurrences into a fresh instance. Protected by CRON_SECRET (Vercel injects it).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return error("Unauthorized", 401);
  const result = await sweepGoals();
  return json({ ok: true, ...result });
}
