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

// 3-tier packaging — pure pricing model lives in ./pricing (client-safe).
// Re-exported here so existing server callers can keep importing from @/lib/stripe.
import {
  TIERS,
  ANNUAL_DISCOUNT,
  setterSeatsFor,
  type PlanConfig,
} from "@/lib/pricing";
export {
  TIERS,
  ANNUAL_DISCOUNT,
  FOUNDERS_CLOSE_ISO,
  foundersOpen,
  setterSeatsFor,
  planMonthly,
  planTotal,
  entitlements,
} from "@/lib/pricing";
export type { PlanTier, Cadence, PlanConfig } from "@/lib/pricing";

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
 * Creates a tier-aware subscription Checkout session. Team bills per setter
 * seat; Practice bills a location base (1 mgr + 2 setters) plus extra setter
 * seats; Group is custom (sales-led) and is NOT self-serve. Quarterly bills 3
 * months upfront; annual bills 12 months with ~10% off. Founders rates lock in.
 */
export async function createSubscriptionCheckout(opts: PlanConfig & {
  officeId: string;
  stripeCustomerId?: string | null;
  customerEmail?: string;
  origin: string;
}): Promise<string> {
  if (opts.tier === "GROUP") throw new Error("Group / DSO plans are sales-led — contact us.");
  const stripe = getStripe();
  const k = opts.founder ? "founder" : "std";
  const annual = opts.cadence === "ANNUAL";
  const recurring = annual
    ? ({ interval: "year", interval_count: 1 } as const)
    : ({ interval: "month", interval_count: 3 } as const);
  // multiply monthly → cadence amount, in cents
  const cents = (monthly: number) => Math.round((annual ? monthly * 12 * (1 - ANNUAL_DISCOUNT) : monthly * 3) * 100);

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  if (opts.tier === "TEAM") {
    line_items.push({
      quantity: Math.max(1, opts.seats ?? 1),
      price_data: {
        currency: "usd",
        unit_amount: cents(TIERS.TEAM.perSeatMonthly[k]),
        recurring,
        product_data: { name: `SetMo Team — setter seat${opts.founder ? " (Founders)" : ""}` },
      },
    });
  } else {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: cents(TIERS.PRACTICE.baseMonthly[k]),
        recurring,
        product_data: { name: `SetMo Practice — location base, 1 manager + 2 setters${opts.founder ? " (Founders)" : ""}` },
      },
    });
    const extra = Math.max(0, opts.extraSetters ?? 0);
    if (extra > 0) {
      line_items.push({
        quantity: extra,
        price_data: {
          currency: "usd",
          unit_amount: cents(TIERS.PRACTICE.extraSeatMonthly[k]),
          recurring,
          product_data: { name: `SetMo Practice — additional setter seat${opts.founder ? " (Founders)" : ""}` },
        },
      });
    }
  }

  const meta = {
    kind: "subscription",
    officeId: opts.officeId,
    planTier: opts.tier,
    isFounder: String(opts.founder),
    setterSeats: String(setterSeatsFor(opts)),
  };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId }
      : opts.customerEmail
        ? { customer_email: opts.customerEmail }
        : {}),
    line_items,
    subscription_data: { metadata: meta },
    metadata: meta,
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
