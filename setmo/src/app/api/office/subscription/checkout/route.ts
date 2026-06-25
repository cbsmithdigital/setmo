import { z } from "zod";
import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { createAccessCheckout, isStripeConfigured } from "@/lib/stripe";
import { error, json } from "@/lib/api";

const Body = z.object({ plan: z.enum(["monthly", "annual"]).optional() });

// POST /api/office/subscription/checkout — start Practice Access (monthly $44.95
// or annual prepay = 2 months free). Annual supersedes an existing monthly sub.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!isManagerRole(getActiveRole(user))) return error("Only admins can manage the subscription", 403);
  if (!user.officeId) return error("No office assigned", 400);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const plan = parsed.success ? parsed.data.plan : undefined;

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createAccessCheckout({
      officeId: user.officeId,
      stripeCustomerId: user.office?.stripeCustomerId,
      customerEmail: user.email,
      plan,
      origin,
    });
    return json({ url });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Checkout failed", 502);
  }
}
