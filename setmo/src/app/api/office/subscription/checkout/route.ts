import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  createSubscriptionCheckout,
  isStripeConfigured,
  MAX_SELF_SERVE_SEATS,
} from "@/lib/stripe";
import { error, json } from "@/lib/api";

const Body = z.object({
  seats: z.number().int().min(1),
  cadence: z.enum(["MONTHLY", "QUARTERLY"]),
});

// POST /api/office/subscription/checkout — start a seat-subscription Checkout.
// Over 20 seats is contact-us, not self-serve.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role)) {
    return error("Only admins can manage the subscription", 403);
  }
  if (!user.officeId) return error("No office assigned", 400);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid plan", 422);
  if (parsed.data.seats > MAX_SELF_SERVE_SEATS) {
    return error("Over 20 seats is custom — contact us for DSO pricing.", 422);
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createSubscriptionCheckout({
      officeId: user.officeId,
      stripeCustomerId: user.office?.stripeCustomerId,
      customerEmail: user.email,
      seats: parsed.data.seats,
      cadence: parsed.data.cadence,
      origin,
    });
    return json({ url });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Checkout failed", 502);
  }
}
