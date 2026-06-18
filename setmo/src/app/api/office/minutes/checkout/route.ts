import { z } from "zod";
import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { createMinuteCheckout, isStripeConfigured, MIN_MINUTES, MAX_MINUTES } from "@/lib/stripe";
import { error, json } from "@/lib/api";

const Body = z.object({ minutes: z.number().int().min(MIN_MINUTES).max(MAX_MINUTES) });

// POST /api/office/minutes/checkout — buy a minute balance (slider amount).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!isManagerRole(getActiveRole(user))) return error("Only admins can purchase minutes", 403);
  if (!user.officeId) return error("No office assigned", 400);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid minute amount", 422);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createMinuteCheckout({
      officeId: user.officeId,
      stripeCustomerId: user.office?.stripeCustomerId,
      customerEmail: user.email,
      minutes: parsed.data.minutes,
      origin,
    });
    return json({ url });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Checkout failed", 502);
  }
}
