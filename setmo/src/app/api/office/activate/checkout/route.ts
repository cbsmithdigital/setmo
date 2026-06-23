import { z } from "zod";
import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { createActivationCheckout, isStripeConfigured, MIN_MINUTES, MAX_MINUTES } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { error, json } from "@/lib/api";

const Body = z.object({ minutes: z.number().int().min(MIN_MINUTES).max(MAX_MINUTES) });

// POST /api/office/activate/checkout — first-time activation: one checkout that
// starts the $44.95/mo access subscription AND buys the chosen starter minutes.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!isManagerRole(getActiveRole(user))) return error("Only admins can activate the practice", 403);
  if (!user.officeId) return error("No office assigned", 400);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid minute amount", 422);

  // Already active → activation is a no-op; send them to the top-up flow instead.
  const existing = await prisma.subscription.findUnique({ where: { officeId: user.officeId }, select: { status: true } });
  if (existing?.status === "ACTIVE") return error("Access is already active — buy minutes from the top-up slider.", 409);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createActivationCheckout({
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
