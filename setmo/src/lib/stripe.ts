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
  const meta = { kind: "minutes", officeId: opts.officeId, minutes: String(quote.minutes) };
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

export function constructWebhookEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not configured.");
  if (!signature) throw new Error("Missing stripe-signature header");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
