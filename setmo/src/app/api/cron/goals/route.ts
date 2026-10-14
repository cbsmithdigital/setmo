import { json, error } from "@/lib/api";
import { cronAuthorized } from "@/lib/cron-auth";
import { sweepGoals } from "@/lib/goals";
import { runPartnerPayouts } from "@/lib/payouts";
import { sweepMinuteThresholds, sweepOrgCoachThresholds } from "@/lib/usage";
import { sweepRateLimits } from "@/lib/rate-limit";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/cron/goals — daily sweep: re-evaluate every active goal (catches
// outcome entries, streaks, time windows), expire ended goals, and roll monthly
// recurrences. Also runs partner payouts on the 1st & 15th (piggybacked to stay
// under Vercel's cron limit). Protected by CRON_SECRET (Vercel injects it).
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return error("Unauthorized", 401);
  const result = await sweepGoals();
  const minutes = await sweepMinuteThresholds().catch(() => null);
  const groupCoach = await sweepOrgCoachThresholds().catch(() => null);
  await sweepRateLimits().catch(() => 0); // expired request counters

  const day = new Date().getUTCDate();
  const payouts = day === 1 || day === 15 ? await runPartnerPayouts(false).catch(() => null) : null;

  return json({ ok: true, ...result, ...(minutes ? { minuteChecks: minutes.checked } : {}), ...(groupCoach ? { groupCoachChecks: groupCoach.checked } : {}), ...(payouts ? { payouts: { runKey: payouts.runKey, paid: payouts.rows.filter((r) => r.status === "PAID").length, paidCents: payouts.paidCents } } : {}) });
}
