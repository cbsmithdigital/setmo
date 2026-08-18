import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { createCallCenterTokenCheckout, isStripeConfigured, MIN_MINUTES, MAX_MINUTES } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { error, json } from "@/lib/api";

const Body = z.object({ minutes: z.number().int().min(MIN_MINUTES).max(MAX_MINUTES) });

// POST /api/callcenter/tokens/checkout — senior manager funds the pooled
// call-center practice balance. Card is saved for one-click top-ups.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (getActiveRole(user) !== "CALL_CENTER_ADMIN" || !user.organizationId) return error("Call-center admins only", 403);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { stripeCustomerId: true } });
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createCallCenterTokenCheckout({
      organizationId: user.organizationId,
      stripeCustomerId: org?.stripeCustomerId,
      customerEmail: user.email,
      minutes: parsed.data.minutes,
      origin,
    });
    return json({ url });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Checkout failed", 502);
  }
}
