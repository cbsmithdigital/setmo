import { json, error } from "@/lib/api";
import { cronAuthorized } from "@/lib/cron-auth";
import { runPartnerPayouts } from "@/lib/payouts";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/cron/partner-payouts — pay out EARNED partner commissions. Scheduled
// for the 1st & 15th (vercel.json). CRON_SECRET-gated.
//   ?dryRun=1 → report only, pays nothing.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return error("Unauthorized", 401);
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const result = await runPartnerPayouts(dryRun);
  return json({ ok: true, dryRun, ...result });
}
