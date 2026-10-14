import { json, error } from "@/lib/api";
import { cronAuthorized } from "@/lib/cron-auth";
import { sweepGoals } from "@/lib/goals";
import { sweepMinuteThresholds, sweepOrgCoachThresholds } from "@/lib/usage";
import { sweepRateLimits } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/cron/goals — daily sweep: re-evaluate every active goal (catches
// outcome entries, streaks, time windows), expire ended goals, and roll monthly
// recurrences; then balance alerts and housekeeping. Partner payouts run on their
// own cron (1st & 15th). Protected by CRON_SECRET (Vercel injects it).
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return error("Unauthorized", 401);
  const result = await sweepGoals();
  const minutes = await sweepMinuteThresholds().catch(() => null);
  const groupCoach = await sweepOrgCoachThresholds().catch(() => null);
  await sweepRateLimits().catch(() => 0); // expired request counters
  // Stripe redelivers for days at most; 90 days of handled-event ids is plenty.
  await prisma.stripeEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400_000) } } }).catch(() => {});


  return json({ ok: true, ...result, ...(minutes ? { minuteChecks: minutes.checked } : {}), ...(groupCoach ? { groupCoachChecks: groupCoach.checked } : {}) });
}
