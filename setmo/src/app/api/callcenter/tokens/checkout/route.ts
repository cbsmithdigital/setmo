import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { createCallCenterTokenCheckout, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { checkMinutes } from "@/lib/minute-limits";
import { error, json } from "@/lib/api";
import { inDemoAccount, DEMO_BILLING_MESSAGE } from "@/lib/demo-shared";

const Body = z.object({ minutes: z.number().int().min(1) });

// POST /api/callcenter/tokens/checkout — senior manager funds the pooled
// call-center practice balance. Card is saved for one-click top-ups.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (inDemoAccount(user)) return error(DEMO_BILLING_MESSAGE, 403);
  if (getActiveRole(user) !== "CALL_CENTER_ADMIN" || !user.organizationId) return error("Call-center admins only", 403);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const bounds = await checkMinutes(parsed.data.minutes);
  if (!bounds.ok) return error(bounds.message, bounds.status, bounds.code ? { code: bounds.code } : undefined);

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
