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

// Conversation-bundle catalog (prepaid hours that stack on the pooled allowance).
// Priced above the ~$9/call-hour cost basis. Mirrors the prototype.
export const BUNDLES: { hours: number; priceUsd: number; popular?: boolean }[] = [
  { hours: 5, priceUsd: 49 },
  { hours: 10, priceUsd: 89, popular: true },
  { hours: 20, priceUsd: 159 },
];

export function bundleByHours(hours: number) {
  return BUNDLES.find((b) => b.hours === hours) ?? null;
}

// Seat pricing + volume discount (PRD §9). Over 20 seats is contact-us.
export const PRICE_PER_SEAT = 59.99;
export function seatDiscount(seats: number): { rate: number; label: string } {
  if (seats >= 15 && seats <= 20) return { rate: 0.15, label: "15% volume discount (15–20 seats)" };
  if (seats >= 10 && seats <= 14) return { rate: 0.1, label: "10% volume discount (10–14 seats)" };
  return { rate: 0, label: "Standard pricing" };
}

/** Monthly (or quarterly, billed upfront) plan total for a seat count. */
export function planTotal(seats: number, cadence: "MONTHLY" | "QUARTERLY") {
  const monthly = seats * PRICE_PER_SEAT * (1 - seatDiscount(seats).rate);
  // Quarterly billed upfront for 3 months with a modest 5% commitment discount.
  return cadence === "QUARTERLY" ? monthly * 3 * 0.95 : monthly;
}

/** Creates a one-time Checkout session for a conversation bundle. */
export async function createBundleCheckout(opts: {
  officeId: string;
  stripeCustomerId?: string | null;
  customerEmail?: string;
  hours: number;
  origin: string;
}): Promise<string> {
  const stripe = getStripe();
  const bundle = bundleByHours(opts.hours);
  if (!bundle) throw new Error("Unknown bundle size");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId }
      : opts.customerEmail
        ? { customer_email: opts.customerEmail }
        : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: bundle.priceUsd * 100,
          product_data: {
            name: `SetMo conversation bundle — +${bundle.hours} hours`,
            description: "Prepaid practice time that stacks on your included pool.",
          },
        },
      },
    ],
    metadata: { kind: "bundle", officeId: opts.officeId, hours: String(bundle.hours) },
    success_url: `${opts.origin}/office/billing?bundle=success`,
    cancel_url: `${opts.origin}/office/billing?bundle=cancel`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

// Additional Setter Audits (the first per practice is free).
export const AUDIT_PRICE_USD = 50;

/** Creates a one-time Checkout session for a paid Setter Audit. */
export async function createAuditCheckout(opts: {
  auditId: string;
  customerEmail?: string;
  practiceName: string;
  origin: string;
}): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(opts.customerEmail ? { customer_email: opts.customerEmail } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: AUDIT_PRICE_USD * 100,
          product_data: {
            name: "SetMo Setter Assessment",
            description: `Additional setter audit for ${opts.practiceName}`,
          },
        },
      },
    ],
    metadata: { kind: "audit", auditId: opts.auditId },
    success_url: `${opts.origin}/audit/${opts.auditId}?paid=1`,
    cancel_url: `${opts.origin}/audit/${opts.auditId}?paid=cancel`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export const MAX_SELF_SERVE_SEATS = 20;

/**
 * Creates a subscription Checkout session for a seat plan. Over 20 seats is
 * contact-us (PRD §9), so callers must validate the ceiling first. The volume
 * discount is baked into the per-seat unit amount; quarterly bills 3 months
 * upfront with a 5% commitment discount.
 */
export async function createSubscriptionCheckout(opts: {
  officeId: string;
  stripeCustomerId?: string | null;
  customerEmail?: string;
  seats: number;
  cadence: "MONTHLY" | "QUARTERLY";
  origin: string;
}): Promise<string> {
  const stripe = getStripe();
  const discounted = PRICE_PER_SEAT * (1 - seatDiscount(opts.seats).rate);
  const quarterly = opts.cadence === "QUARTERLY";
  const unitAmount = Math.round((quarterly ? discounted * 3 * 0.95 : discounted) * 100);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId }
      : opts.customerEmail
        ? { customer_email: opts.customerEmail }
        : {}),
    line_items: [
      {
        quantity: opts.seats,
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          recurring: { interval: "month", interval_count: quarterly ? 3 : 1 },
          product_data: { name: "SetMo seat — appointment-setter training" },
        },
      },
    ],
    subscription_data: { metadata: { officeId: opts.officeId } },
    metadata: { kind: "subscription", officeId: opts.officeId },
    success_url: `${opts.origin}/office/billing?sub=success`,
    cancel_url: `${opts.origin}/office/billing?sub=cancel`,
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
