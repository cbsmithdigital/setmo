import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { createBillingPortalSession, isStripeConfigured } from "@/lib/stripe";
import { error, json } from "@/lib/api";

// POST /api/group/billing-portal — open the Stripe customer portal for the group's
// coach-token wallet customer, so a group/DSO admin can update or remove their card
// and download token-purchase receipts.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (getActiveRole(user) !== "GROUP_ADMIN" || !user.organizationId) return error("Group admins only", 403);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const customerId = user.organization?.stripeCustomerId;
  if (!customerId) return error("No card on file yet — buy tokens once to add one.", 400);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createBillingPortalSession({ customerId, returnUrl: `${origin}/group/billing` });
    return json({ url });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't open billing portal", 502);
  }
}
