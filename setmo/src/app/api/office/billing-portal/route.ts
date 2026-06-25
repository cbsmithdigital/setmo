import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { createBillingPortalSession, isStripeConfigured } from "@/lib/stripe";
import { error, json } from "@/lib/api";

// POST /api/office/billing-portal — open the Stripe customer portal so an admin
// can cancel, update their card, or download invoices.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!isManagerRole(getActiveRole(user))) return error("Only admins can manage billing", 403);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const customerId = user.office?.stripeCustomerId ?? user.office?.subscription?.stripeCustomerId;
  if (!customerId) return error("No billing account yet — activate access first.", 400);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createBillingPortalSession({ customerId, returnUrl: `${origin}/office/billing` });
    return json({ url });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't open billing portal", 502);
  }
}
