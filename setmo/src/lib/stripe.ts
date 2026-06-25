import Stripe from "stripe";

// Lazy Stripe client — not instantiated at import (keeps `next build` env-free).
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured.");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Flat-access + minutes pricing model (client-safe) re-exported for servers.
import { minuteQuote } from "@/lib/pricing";
import { getPricingConfig } from "@/lib/config";
export {
  ACCESS_MONTHLY_USD,
  MIN_MINUTES,
  MAX_MINUTES,
  MINUTE_STEP,
  BASE_PER_MIN,
  minutePrice,
  minuteQuote,
  recommendMinutes,
  isBulk,
  groupEnabled,
  entitlements,
} from "@/lib/pricing";
export type { MinuteQuote } from "@/lib/pricing";

/** Practice Access subscription — monthly ($44.95) or annual prepay (10× = 2 months free). */
export async function createAccessCheckout(opts: {
  officeId: string;
  stripeCustomerId?: string | null;
  customerEmail?: string;
  origin: string;
  plan?: "monthly" | "annual";
}): Promise<string> {
  const stripe = getStripe();
  const cfg = await getPricingConfig();
  const annual = opts.plan === "annual";
  const meta = { kind: "access", officeId: opts.officeId, plan: annual ? "annual" : "monthly" };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId, customer_update: { address: "auto" as const } }
      : opts.customerEmail
        ? { customer_email: opts.customerEmail }
        : {}),
    billing_address_collection: "required",
    automatic_tax: { enabled: true },
    allow_promotion_codes: true,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round((annual ? cfg.accessMonthly * 10 : cfg.accessMonthly) * 100),
          recurring: { interval: annual ? "year" : "month" },
          tax_behavior: "exclusive",
          product_data: annual
            ? { name: "SetMo — Practice Access (annual)", description: "Annual access per location — 2 months free. Unlimited users, all features." }
            : { name: "SetMo — Practice Access", description: "Monthly access per location. Unlimited users, all features." },
        },
      },
    ],
    subscription_data: { metadata: meta },
    metadata: meta,
    success_url: `${opts.origin}/office/billing?access=success`,
    cancel_url: `${opts.origin}/office/billing?access=cancel`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/** One-time token purchase (any amount on the slider). `discountPct` = account tier. */
export async function createMinuteCheckout(opts: {
  officeId: string;
  minutes: number;
  stripeCustomerId?: string | null;
  customerEmail?: string;
  origin: string;
  discountPct?: number;
}): Promise<string> {
  const stripe = getStripe();
  const quote = minuteQuote(opts.minutes, await getPricingConfig());
  const tokens = quote.minutes * 10;
  const total = Math.round(quote.total * (1 - (opts.discountPct ?? 0) / 100)); // account discount on tokens
  // amountCents = pre-tax cash (post-discount), so commission accrues on real revenue.
  const meta = { kind: "minutes", officeId: opts.officeId, minutes: String(quote.minutes), amountCents: String(total * 100) };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId, customer_update: { address: "auto" as const } }
      : opts.customerEmail
        ? { customer_email: opts.customerEmail }
        : {}),
    billing_address_collection: "required",
    automatic_tax: { enabled: true },
    allow_promotion_codes: true,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: total * 100,
          tax_behavior: "exclusive",
          product_data: {
            name: `SetMo — ${tokens.toLocaleString()} tokens`,
            description: `Practice & coaching tokens (≈ ${quote.minutes.toLocaleString()} min). Roll over, never expire.${opts.discountPct ? ` ${opts.discountPct}% account discount applied.` : ""}`,
          },
        },
      },
    ],
    metadata: meta,
    success_url: `${opts.origin}/office/billing?minutes=success`,
    cancel_url: `${opts.origin}/office/billing?minutes=cancel`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/**
 * First-time activation: one Checkout session that starts the $44.95/mo access
 * subscription AND charges the chosen minutes once on the first invoice. Months
 * 2+ bill access only.
 */
export async function createActivationCheckout(opts: {
  officeId: string;
  minutes: number;
  stripeCustomerId?: string | null;
  customerEmail?: string;
  origin: string;
  plan?: "monthly" | "annual";
  discountPct?: number;
}): Promise<string> {
  const stripe = getStripe();
  const cfg = await getPricingConfig();
  const quote = minuteQuote(opts.minutes, cfg);
  const annual = opts.plan === "annual";
  const tokens = quote.minutes * 10;
  const tokenTotal = Math.round(quote.total * (1 - (opts.discountPct ?? 0) / 100));
  // session metadata drives token granting; subscription metadata drives access sync.
  const meta = { kind: "activation", officeId: opts.officeId, minutes: String(quote.minutes), amountCents: String(tokenTotal * 100) };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId, customer_update: { address: "auto" as const } }
      : opts.customerEmail
        ? { customer_email: opts.customerEmail }
        : {}),
    billing_address_collection: "required",
    automatic_tax: { enabled: true },
    allow_promotion_codes: true,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round((annual ? cfg.accessMonthly * 10 : cfg.accessMonthly) * 100),
          recurring: { interval: annual ? "year" : "month" },
          tax_behavior: "exclusive",
          product_data: annual
            ? { name: "SetMo — Practice Access (annual)", description: "Annual access per location — 2 months free. Unlimited users, all features." }
            : { name: "SetMo — Practice Access", description: "Monthly access per location. Unlimited users, all features." },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: tokenTotal * 100,
          tax_behavior: "exclusive",
          product_data: {
            name: `SetMo — ${tokens.toLocaleString()} tokens`,
            description: `Starter token balance (≈ ${quote.minutes.toLocaleString()} min). Roll over, never expire.${opts.discountPct ? ` ${opts.discountPct}% account discount applied.` : ""}`,
          },
        },
      },
    ],
    subscription_data: { metadata: { kind: "access", officeId: opts.officeId, plan: annual ? "annual" : "monthly" } },
    metadata: meta,
    success_url: `${opts.origin}/office/billing?activate=success`,
    cancel_url: `${opts.origin}/office/billing?activate=cancel`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/**
 * Auto top-up: charge the customer's saved card off-session for `minutes` and
 * grant them immediately on success. Returns true if charged + granted.
 * NOTE: off-session PaymentIntents don't run Stripe Tax (unlike Checkout); auto
 * top-ups are charged at the minute price without added sales tax.
 */
export async function chargeMinutesAuto(opts: { officeId: string; customerId: string; minutes: number }): Promise<boolean> {
  const { prisma } = await import("@/lib/db");
  const stripe = getStripe();
  const quote = minuteQuote(opts.minutes, await getPricingConfig());
  const { accountTokenDiscountPct } = await import("@/lib/usage");
  const discountPct = await accountTokenDiscountPct(opts.officeId);
  const total = Math.round(quote.total * (1 - discountPct / 100)); // account discount on tokens
  const tokens = quote.minutes * 10;

  // Find a saved card: the customer's invoice default, else any attached card.
  const customer = (await stripe.customers.retrieve(opts.customerId)) as Stripe.Customer;
  let pm = (customer.invoice_settings?.default_payment_method as string | null) ?? null;
  if (!pm) {
    const list = await stripe.paymentMethods.list({ customer: opts.customerId, type: "card", limit: 1 });
    pm = list.data[0]?.id ?? null;
  }
  if (!pm) return false; // no card on file → can't auto-charge

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create({
      amount: total * 100,
      currency: "usd",
      customer: opts.customerId,
      payment_method: pm,
      off_session: true,
      confirm: true,
      description: `SetMo — ${tokens.toLocaleString()} tokens (auto top-up)`,
      metadata: { kind: "minutes_auto", officeId: opts.officeId, minutes: String(quote.minutes), amountCents: String(total * 100) },
    });
  } catch {
    return false; // declined / requires authentication — admins were already warned
  }
  if (pi.status !== "succeeded") return false;

  // Grant once (idempotent on the PaymentIntent id).
  const existing = await prisma.conversationBundle.findFirst({ where: { stripePaymentIntent: pi.id } });
  if (!existing) {
    const { addMinutes } = await import("@/lib/usage");
    await addMinutes(opts.officeId, quote.minutes, pi.id, total * 100);
    const { accrueCommission } = await import("@/lib/partners");
    const sub = await prisma.subscription.findUnique({ where: { officeId: opts.officeId }, select: { paidInvoices: true } });
    await accrueCommission({ officeId: opts.officeId, kind: "MINUTES", baseCents: total * 100, stripeRef: `${pi.id}:min`, earned: (sub?.paidInvoices ?? 0) >= 2 }).catch(() => {});
  }
  return true;
}

/** Stripe-hosted billing portal — customers cancel, update card, view invoices. */
export async function createBillingPortalSession(opts: { customerId: string; returnUrl: string }): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({ customer: opts.customerId, return_url: opts.returnUrl });
  return session.url;
}

export function constructWebhookEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not configured.");
  if (!signature) throw new Error("Missing stripe-signature header");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
