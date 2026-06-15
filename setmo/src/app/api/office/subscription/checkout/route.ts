import { z } from "zod";
import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import {
  createSubscriptionCheckout,
  isStripeConfigured,
  foundersOpen,
  MAX_SELF_SERVE_SEATS,
} from "@/lib/stripe";
import { error, json } from "@/lib/api";

const Body = z.object({
  tier: z.enum(["TEAM", "PRACTICE"]), // Group is sales-led, not self-serve
  cadence: z.enum(["QUARTERLY", "ANNUAL"]),
  seats: z.number().int().min(1).max(MAX_SELF_SERVE_SEATS).optional(), // Team
  extraSetters: z.number().int().min(0).max(MAX_SELF_SERVE_SEATS).optional(), // Practice
});

// POST /api/office/subscription/checkout — start a tier-aware subscription
// Checkout. Founders pricing applies automatically while the offer is open.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!isManagerRole(getActiveRole(user))) {
    return error("Only admins can manage the subscription", 403);
  }
  if (!user.officeId) return error("No office assigned", 400);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid plan", 422);
  const { tier, cadence, seats, extraSetters } = parsed.data;

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createSubscriptionCheckout({
      officeId: user.officeId,
      stripeCustomerId: user.office?.stripeCustomerId,
      customerEmail: user.email,
      tier,
      cadence,
      founder: foundersOpen(),
      seats,
      extraSetters,
      origin,
    });
    return json({ url });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Checkout failed", 502);
  }
}
