import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { createBillingPortalSession, isPortalNotConfigured, isStripeConfigured } from "@/lib/stripe";
import { error, json } from "@/lib/api";
import { inDemoAccount, DEMO_BILLING_MESSAGE } from "@/lib/demo-shared";
import { captureError } from "@/lib/observability";

// POST /api/office/billing-portal — open the Stripe customer portal so an admin
// can cancel, update their card, or download invoices.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (inDemoAccount(user)) return error(DEMO_BILLING_MESSAGE, 403);
  if (!isManagerRole(getActiveRole(user))) return error("Only admins can manage billing", 403);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const customerId = user.office?.stripeCustomerId ?? user.office?.subscription?.stripeCustomerId;
  if (!customerId) {
    // Access the SetMo team switched on by hand has no Stripe customer to manage.
    return user.office?.subscription?.status === "ACTIVE"
      ? error("Your Practice Access is managed by the SetMo team. Email hello@growdental.ai to change or cancel it.", 400)
      : error("No billing account yet — activate access first.", 400);
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createBillingPortalSession({ customerId, returnUrl: `${origin}/office/billing` });
    return json({ url });
  } catch (e) {
    // The admin gets a message they can act on; Stripe's details go to the logs.
    captureError(e, { scope: "billing-portal", officeId: user.officeId, customerId });
    return error(
      isPortalNotConfigured(e)
        ? "The billing portal isn't available right now. Email hello@growdental.ai and we'll take care of it — card changes, invoices or cancelling."
        : "Couldn't open the billing portal just now. Try again in a minute, or email hello@growdental.ai.",
      502,
    );
  }
}
