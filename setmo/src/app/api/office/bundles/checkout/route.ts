import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createBundleCheckout, isStripeConfigured, bundleByHours } from "@/lib/stripe";
import { error, json } from "@/lib/api";

const Body = z.object({ hours: z.number().int() });

// POST /api/office/bundles/checkout — start a Stripe Checkout session for a
// conversation bundle. The BundleCredit is created on payment via the webhook.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role)) {
    return error("Only admins can purchase bundles", 403);
  }
  if (!user.officeId) return error("No office assigned", 400);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !bundleByHours(parsed.data.hours)) {
    return error("Invalid bundle", 422);
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createBundleCheckout({
      officeId: user.officeId,
      stripeCustomerId: user.office?.stripeCustomerId,
      customerEmail: user.email,
      hours: parsed.data.hours,
      origin,
    });
    return json({ url });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Checkout failed", 502);
  }
}
