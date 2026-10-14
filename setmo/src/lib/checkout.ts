import { prisma } from "@/lib/db";
import { createActivationCheckout, createAccessCheckout, createMinuteCheckout, isStripeConfigured } from "@/lib/stripe";
import { getPlatformConfig, promoBonusMinutes } from "@/lib/config";
import { checkMinutes } from "@/lib/minute-limits";
import { accountTokenDiscountPct, hasSignupBonusGrant } from "@/lib/usage";

// Starting a checkout for a location — shared by the office's own Billing page
// and a group admin buying for one of the group's locations.

type Buyer = { officeId: string; customerEmail: string; origin: string; returnPath?: string };
export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string; status: number; code?: string };

/** First-time activation: one checkout that starts access (monthly or annual
 *  prepay) AND buys the chosen starter tokens. minutes 0 = access-only (the
 *  sign-up promo's bonus tokens are the starter balance). */
export async function startActivationCheckout(buyer: Buyer & { minutes: number; plan?: "monthly" | "annual" }): Promise<CheckoutResult> {
  if (!isStripeConfigured()) return { ok: false, error: "Billing isn't configured yet", status: 503 };
  const bounds = await checkMinutes(buyer.minutes, { allowZero: true });
  if (!bounds.ok) return { ok: false, error: bounds.message, status: bounds.status, code: bounds.code };

  const office = await prisma.office.findUnique({ where: { id: buyer.officeId }, select: { stripeCustomerId: true, subscription: { select: { status: true } } } });
  if (!office) return { ok: false, error: "Location not found", status: 404 };
  // Already active → activation is a no-op; buy tokens instead.
  if (office.subscription?.status === "ACTIVE") return { ok: false, error: "Access is already active — buy tokens from the top-up slider.", status: 409 };

  const plan = buyer.plan ?? "monthly";
  const cfg = await getPlatformConfig();
  const discountPct = plan === "annual" ? cfg.annualTokenDiscountPct : cfg.monthlyTokenDiscountPct;
  // One bonus per office, ever: never promise (or print on the Stripe line item)
  // a bonus the webhook's per-office guard would refuse to deliver — e.g. a
  // cancel → reactivate inside the window, or a future promo run.
  const bonusMinutes = (await hasSignupBonusGrant(buyer.officeId)) ? 0 : promoBonusMinutes(cfg, plan);
  // Access-only activation is a promo-window path: without bonus tokens there'd
  // be no balance to practice on, so outside the window require starter tokens.
  if (buyer.minutes === 0 && bonusMinutes <= 0) return { ok: false, error: "Pick a starter token amount to activate.", status: 422 };

  try {
    const common = {
      officeId: buyer.officeId,
      stripeCustomerId: office.stripeCustomerId,
      customerEmail: buyer.customerEmail,
      plan,
      origin: buyer.origin,
      bonusMinutes,
      returnPath: buyer.returnPath,
    };
    const url = buyer.minutes === 0
      ? await createAccessCheckout(common)
      : await createActivationCheckout({ ...common, minutes: buyer.minutes, discountPct });
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Checkout failed", status: 502 };
  }
}

/** Buy tokens (slider amount) for a location. */
export async function startTokenCheckout(buyer: Buyer & { minutes: number }): Promise<CheckoutResult> {
  if (!isStripeConfigured()) return { ok: false, error: "Billing isn't configured yet", status: 503 };
  const bounds = await checkMinutes(buyer.minutes);
  if (!bounds.ok) return { ok: false, error: bounds.message, status: bounds.status, code: bounds.code };
  const office = await prisma.office.findUnique({ where: { id: buyer.officeId }, select: { stripeCustomerId: true } });
  if (!office) return { ok: false, error: "Location not found", status: 404 };
  try {
    const url = await createMinuteCheckout({
      officeId: buyer.officeId,
      stripeCustomerId: office.stripeCustomerId,
      customerEmail: buyer.customerEmail,
      minutes: buyer.minutes,
      discountPct: await accountTokenDiscountPct(buyer.officeId),
      origin: buyer.origin,
      returnPath: buyer.returnPath,
    });
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Checkout failed", status: 502 };
  }
}
