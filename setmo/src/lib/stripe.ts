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

/** Monthly Practice Access subscription ($44.95 / location, month-to-month). */
export async function createAccessCheckout(opts: {
  officeId: string;
  stripeCustomerId?: string | null;
  customerEmail?: string;
  origin: string;
}): Promise<string> {
  const stripe = getStripe();
  const cfg = await getPricingConfig();
  const meta = { kind: "access", officeId: opts.officeId };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId, customer_update: { address: "auto" as const } }
      : opts.customerEmail
        ? { customer_email: opts.customerEmail }
        : {}),
    // Stripe Tax: collect a billing address and compute sales tax automatically.
    billing_address_collection: "required",
    automatic_tax: { enabled: true },
    // Let customers enter a promotion code (coupons managed in the Stripe dashboard).
    allow_promotion_codes: true,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(cfg.accessMonthly * 100),
          recurring: { interval: "month" },
          tax_behavior: "exclusive",
          product_data: { name: "SetMo — Practice Access", description: "Monthly access per location. Unlimited users, all features." },
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

/** One-time purchase of a minute balance (any amount on the slider). */
export async function createMinuteCheckout(opts: {
  officeId: string;
  minutes: number;
  stripeCustomerId?: string | null;
  customerEmail?: string;
  origin: string;
}): Promise<string> {
  const stripe = getStripe();
  const quote = minuteQuote(opts.minutes, await getPricingConfig());
  // amountCents = pre-tax minutes cost, so commission accrual ignores tax.
  const meta = { kind: "minutes", officeId: opts.officeId, minutes: String(quote.minutes), amountCents: String(quote.total * 100) };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId, customer_update: { address: "auto" as const } }
      : opts.customerEmail
        ? { customer_email: opts.customerEmail }
        : {}),
    // Stripe Tax: collect a billing address and compute sales tax automatically.
    billing_address_collection: "required",
    automatic_tax: { enabled: true },
    // Let customers enter a promotion code (coupons managed in the Stripe dashboard).
    allow_promotion_codes: true,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: quote.total * 100,
          tax_behavior: "exclusive",
          product_data: {
            name: `SetMo — ${quote.minutes.toLocaleString()} minutes`,
            description: `Practice/coaching minutes ($${quote.perMin.toFixed(2)}/min). Roll over, never expire.`,
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
}): Promise<string> {
  const stripe = getStripe();
  const cfg = await getPricingConfig();
  const quote = minuteQuote(opts.minutes, cfg);
  // session metadata drives minute granting; subscription metadata drives access sync.
  const meta = { kind: "activation", officeId: opts.officeId, minutes: String(quote.minutes), amountCents: String(quote.total * 100) };
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
          unit_amount: Math.round(cfg.accessMonthly * 100),
          recurring: { interval: "month" },
          tax_behavior: "exclusive",
          product_data: { name: "SetMo — Practice Access", description: "Monthly access per location. Unlimited users, all features." },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: quote.total * 100,
          tax_behavior: "exclusive",
          product_data: {
            name: `SetMo — ${quote.minutes.toLocaleString()} minutes`,
            description: `Starter minute balance ($${quote.perMin.toFixed(2)}/min). Roll over, never expire.`,
          },
        },
      },
    ],
    subscription_data: { metadata: { kind: "access", officeId: opts.officeId } },
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
      amount: quote.total * 100,
      currency: "usd",
      customer: opts.customerId,
      payment_method: pm,
      off_session: true,
      confirm: true,
      description: `SetMo — ${quote.minutes.toLocaleString()} minutes (auto top-up)`,
      metadata: { kind: "minutes_auto", officeId: opts.officeId, minutes: String(quote.minutes), amountCents: String(quote.total * 100) },
    });
  } catch {
    return false; // declined / requires authentication — admins were already warned
  }
  if (pi.status !== "succeeded") return false;

  // Grant once (idempotent on the PaymentIntent id).
  const existing = await prisma.conversationBundle.findFirst({ where: { stripePaymentIntent: pi.id } });
  if (!existing) {
    const { addMinutes } = await import("@/lib/usage");
    await addMinutes(opts.officeId, quote.minutes, pi.id);
    const { accrueCommission } = await import("@/lib/partners");
    const sub = await prisma.subscription.findUnique({ where: { officeId: opts.officeId }, select: { paidInvoices: true } });
    await accrueCommission({ officeId: opts.officeId, kind: "MINUTES", baseCents: quote.total * 100, stripeRef: `${pi.id}:min`, earned: (sub?.paidInvoices ?? 0) >= 2 }).catch(() => {});
  }
  return true;
}

export function constructWebhookEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not configured.");
  if (!signature) throw new Error("Missing stripe-signature header");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
