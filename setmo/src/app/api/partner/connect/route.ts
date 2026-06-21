import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { getConnectOnboardingUrl } from "@/lib/payouts";
import { error, json } from "@/lib/api";

// POST /api/partner/connect — start Stripe Connect onboarding for cash payouts.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.partnerId || getActiveRole(user) !== "PARTNER_ADMIN") return error("Forbidden", 403);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const url = await getConnectOnboardingUrl(user.partnerId, origin);
  if (!url) return error("Payouts aren't configured yet", 503);
  return json({ url });
}
