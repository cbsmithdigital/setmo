import { z } from "zod";
import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { createAccessCheckout, hasRunningAnnualAccess, isStripeConfigured } from "@/lib/stripe";
import { error, json } from "@/lib/api";
import { inDemoAccount, DEMO_BILLING_MESSAGE } from "@/lib/demo-shared";
import { captureError } from "@/lib/observability";

const Body = z.object({ plan: z.enum(["monthly", "annual"]).optional() });

const ALREADY_ANNUAL = "You're already on the annual plan, so there's nothing more to pay. If Billing still says Monthly, refresh it in a minute.";

// POST /api/office/subscription/checkout — start Practice Access (monthly $44.95
// or annual prepay = 2 months free). Annual supersedes an existing monthly sub.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (inDemoAccount(user)) return error(DEMO_BILLING_MESSAGE, 403);
  if (!isManagerRole(getActiveRole(user))) return error("Only admins can manage the subscription", 403);
  if (!user.officeId) return error("No office assigned", 400);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const plan = parsed.success ? parsed.data.plan : undefined;

  // Already annual — or paid for it moments ago and the webhook hasn't caught up.
  // A second annual checkout would charge a full year again, and the webhook then
  // cancels the first year's subscription with no refund.
  const sub = user.office?.subscription;
  if (plan === "annual" && sub?.status === "ACTIVE" && sub.plan === "ANNUAL") return error(ALREADY_ANNUAL, 409);
  const customerId = user.office?.stripeCustomerId ?? sub?.stripeCustomerId;

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    if (plan === "annual" && customerId && (await hasRunningAnnualAccess(customerId, user.officeId))) return error(ALREADY_ANNUAL, 409);
    const url = await createAccessCheckout({
      officeId: user.officeId,
      stripeCustomerId: user.office?.stripeCustomerId,
      customerEmail: user.email,
      plan,
      origin,
      switchToAnnual: plan === "annual",
    });
    return json({ url });
  } catch (e) {
    // The admin gets a message they can act on; Stripe's details go to the logs.
    captureError(e, { scope: "access-checkout", officeId: user.officeId, plan: plan ?? "monthly" });
    return error(
      plan === "annual"
        ? "Couldn't start the switch to annual just now. Try again in a minute, or email hello@growdental.ai and we'll switch you over."
        : "Couldn't start checkout just now. Try again in a minute, or email hello@growdental.ai.",
      502,
    );
  }
}
