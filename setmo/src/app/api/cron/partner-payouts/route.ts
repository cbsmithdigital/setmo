import { json, error } from "@/lib/api";
import { runPartnerPayouts } from "@/lib/payouts";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/cron/partner-payouts — pay out EARNED partner commissions. Also runs
// automatically inside the daily goals cron on the 1st & 15th. CRON_SECRET-gated.
//   ?dryRun=1 → report only, pays nothing.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return error("Unauthorized", 401);
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const result = await runPartnerPayouts(dryRun);
  return json({ ok: true, dryRun, ...result });
}
