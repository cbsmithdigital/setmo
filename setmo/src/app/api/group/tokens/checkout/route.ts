import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { createGroupTokenCheckout, isStripeConfigured } from "@/lib/stripe";
import { groupTokenDiscountPct } from "@/lib/usage";
import { checkMinutes } from "@/lib/minute-limits";
import { error, json } from "@/lib/api";

const Body = z.object({ minutes: z.number().int().min(1) });

// POST /api/group/tokens/checkout — group/DSO admin buys Setty Advisor tokens at
// the group discount (50% off list). Card is saved for one-click top-ups.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (getActiveRole(user) !== "GROUP_ADMIN" || !user.organizationId) return error("Group admins only", 403);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const bounds = await checkMinutes(parsed.data.minutes);
  if (!bounds.ok) return error(bounds.message, bounds.status, bounds.code ? { code: bounds.code } : undefined);

  const discountPct = await groupTokenDiscountPct();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createGroupTokenCheckout({
      organizationId: user.organizationId,
      stripeCustomerId: user.organization?.stripeCustomerId,
      customerEmail: user.email,
      minutes: parsed.data.minutes,
      discountPct,
      origin,
    });
    return json({ url });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Checkout failed", 502);
  }
}
