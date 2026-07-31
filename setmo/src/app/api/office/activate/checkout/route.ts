import { z } from "zod";
import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { createActivationCheckout, createAccessCheckout, isStripeConfigured, MIN_MINUTES, MAX_MINUTES } from "@/lib/stripe";
import { getPlatformConfig, promoBonusMinutes } from "@/lib/config";
import { prisma } from "@/lib/db";
import { error, json } from "@/lib/api";

// minutes: 0 = access-only activation (sign-up promo — the bonus tokens are the
// starter balance); otherwise the usual starter-token range applies.
const Body = z.object({
  minutes: z.number().int().min(0).max(MAX_MINUTES).refine((m) => m === 0 || m >= MIN_MINUTES, "Below the starter minimum"),
  plan: z.enum(["monthly", "annual"]).optional(),
});

// POST /api/office/activate/checkout — first-time activation: one checkout that
// starts access (monthly or annual prepay) AND buys the chosen starter tokens.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!isManagerRole(getActiveRole(user))) return error("Only admins can activate the practice", 403);
  if (!user.officeId) return error("No office assigned", 400);
  if (!isStripeConfigured()) return error("Billing isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  // Already active → activation is a no-op; send them to the top-up flow instead.
  const existing = await prisma.subscription.findUnique({ where: { officeId: user.officeId }, select: { status: true } });
  if (existing?.status === "ACTIVE") return error("Access is already active — buy tokens from the top-up slider.", 409);

  const plan = parsed.data.plan ?? "monthly";
  const cfg = await getPlatformConfig();
  const discountPct = plan === "annual" ? cfg.annualTokenDiscountPct : cfg.monthlyTokenDiscountPct;
  // One bonus per office, ever: never promise (or print on the Stripe line item)
  // a bonus the webhook's per-office guard would refuse to deliver — e.g. a
  // cancel → reactivate inside the window, or a future promo run.
  const { hasSignupBonusGrant } = await import("@/lib/usage");
  const bonusMinutes = (await hasSignupBonusGrant(user.officeId)) ? 0 : promoBonusMinutes(cfg, plan);

  // Access-only activation is a promo-window path: without bonus tokens there'd
  // be no balance to practice on, so outside the window require starter tokens.
  if (parsed.data.minutes === 0 && bonusMinutes <= 0) return error("Pick a starter token amount to activate.", 422);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const common = {
      officeId: user.officeId,
      stripeCustomerId: user.office?.stripeCustomerId,
      customerEmail: user.email,
      plan,
      origin,
      bonusMinutes,
    };
    const url = parsed.data.minutes === 0
      ? await createAccessCheckout(common)
      : await createActivationCheckout({ ...common, minutes: parsed.data.minutes, discountPct });
    return json({ url });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Checkout failed", 502);
  }
}
