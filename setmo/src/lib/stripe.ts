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

/** Practice Access subscription — monthly ($44.95) or annual prepay (10× = 2 months free).
 *  `bonusMinutes` (sign-up promo) rides in session metadata; the webhook grants
 *  the comp tokens once the first payment lands. */
export async function createAccessCheckout(opts: {
  officeId: string;
  stripeCustomerId?: string | null;
  customerEmail?: string;
  origin: string;
  plan?: "monthly" | "annual";
  bonusMinutes?: number;
}): Promise<string> {
  const stripe = getStripe();
  const cfg = await getPricingConfig();
  const annual = opts.plan === "annual";
  const bonus = opts.bonusMinutes ?? 0;
  const bonusNote = bonus > 0 ? ` Includes ${(bonus * 10).toLocaleString()} bonus tokens (${Math.round(bonus / 60)} free hours) — sign-up offer.` : "";
  const subMeta = { kind: "access", officeId: opts.officeId, plan: annual ? "annual" : "monthly" };
  const meta = bonus > 0 ? { ...subMeta, bonusMinutes: String(bonus) } : subMeta;
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
            ? { name: "SetMo — Practice Access (annual)", description: `Annual access per location — 2 months free. Unlimited users, all features.${bonusNote}` }
            : { name: "SetMo — Practice Access", description: `Monthly access per location. Unlimited users, all features.${bonusNote}` },
        },
      },
    ],
    subscription_data: { metadata: subMeta },
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
 * Group/DSO coach token purchase — funds the leader's Setty Advisor voice wallet.
 * Sold at `discountPct` off list (default 50% for group/DSO). Saves the card to a
 * group-level Stripe customer so future purchases are one click.
 */
export async function createGroupTokenCheckout(opts: {
  organizationId: string;
  minutes: number;
  stripeCustomerId?: string | null;
  customerEmail?: string;
  origin: string;
  discountPct: number;
}): Promise<string> {
  const stripe = getStripe();
  const quote = minuteQuote(opts.minutes, await getPricingConfig());
  const tokens = quote.minutes * 10;
  const total = Math.round(quote.total * (1 - (opts.discountPct ?? 0) / 100)); // group discount off list
  const meta = { kind: "group_minutes", organizationId: opts.organizationId, minutes: String(quote.minutes), amountCents: String(total * 100) };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId, customer_update: { address: "auto" as const } }
      : opts.customerEmail
        ? { customer_email: opts.customerEmail }
        : {}),
    // Save the card so the next top-up is one click (and a card is on file).
    payment_intent_data: { setup_future_usage: "off_session" },
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
            name: `SetMo — ${tokens.toLocaleString()} Setty Advisor tokens`,
            description: `Group/DSO coaching tokens (≈ ${quote.minutes.toLocaleString()} min). Roll over, never expire.${opts.discountPct ? ` ${opts.discountPct}% group discount applied.` : ""}`,
          },
        },
      },
    ],
    metadata: meta,
    success_url: `${opts.origin}/group/billing?tokens=success`,
    cancel_url: `${opts.origin}/group/billing?tokens=cancel`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/**
 * Call-center pool top-up — funds the pooled practice balance all the call
 * center's agents draw from. Saves the card to a call-center Stripe customer.
 */
export async function createCallCenterTokenCheckout(opts: {
  organizationId: string;
  minutes: number;
  stripeCustomerId?: string | null;
  customerEmail?: string;
  origin: string;
  discountPct?: number;
}): Promise<string> {
  const stripe = getStripe();
  const quote = minuteQuote(opts.minutes, await getPricingConfig());
  const tokens = quote.minutes * 10;
  const total = Math.round(quote.total * (1 - (opts.discountPct ?? 0) / 100));
  const meta = { kind: "callcenter_minutes", organizationId: opts.organizationId, minutes: String(quote.minutes), amountCents: String(total * 100) };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId, customer_update: { address: "auto" as const } }
      : opts.customerEmail
        ? { customer_email: opts.customerEmail }
        : {}),
    payment_intent_data: { setup_future_usage: "off_session" },
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
            name: `SetMo — ${tokens.toLocaleString()} call-center tokens`,
            description: `Pooled agent-practice tokens (≈ ${quote.minutes.toLocaleString()} min). Shared across all your agents & offices. Roll over, never expire.${opts.discountPct ? ` ${opts.discountPct}% off applied.` : ""}`,
          },
        },
      },
    ],
    metadata: meta,
    success_url: `${opts.origin}/callcenter/billing?tokens=success`,
    cancel_url: `${opts.origin}/callcenter/billing?tokens=cancel`,
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
  bonusMinutes?: number;
}): Promise<string> {
  const stripe = getStripe();
  const cfg = await getPricingConfig();
  const quote = minuteQuote(opts.minutes, cfg);
  const annual = opts.plan === "annual";
  const tokens = quote.minutes * 10;
  const tokenTotal = Math.round(quote.total * (1 - (opts.discountPct ?? 0) / 100));
  const bonus = opts.bonusMinutes ?? 0;
  // session metadata drives token granting; subscription metadata drives access sync.
  const meta = {
    kind: "activation",
    officeId: opts.officeId,
    minutes: String(quote.minutes),
    amountCents: String(tokenTotal * 100),
    ...(bonus > 0 ? { bonusMinutes: String(bonus) } : {}),
  };
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
            description: `Starter token balance (≈ ${quote.minutes.toLocaleString()} min). Roll over, never expire.${opts.discountPct ? ` ${opts.discountPct}% account discount applied.` : ""}${bonus > 0 ? ` Plus ${(bonus * 10).toLocaleString()} bonus tokens (${Math.round(bonus / 60)} free hours) — sign-up offer.` : ""}`,
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
 * Super-admin RECURRING billing: one monthly subscription with two tax-INCLUSIVE
 * recurring prices — access + a fixed usage bundle that grants `usageMinutes`
 * each cycle. The card is saved by subscription mode, so future cycles auto-charge.
 * Created today → the billing cycle naturally anchors to today's day-of-month.
 * The minute allowance rides on the subscription metadata; the invoice.paid webhook
 * grants it each cycle (idempotent per invoice). Returns the Checkout URL for the
 * super-admin to complete (they enter the card on Stripe's hosted page).
 */
export async function createRecurringBillingCheckout(opts: {
  officeId: string;
  accessCents: number; // tax-inclusive access charge (e.g. 4495)
  usageCents: number; // tax-inclusive usage charge (e.g. 20505)
  usageMinutes: number; // minutes granted each cycle (e.g. 285)
  stripeCustomerId?: string | null;
  contactEmail?: string; // billing contact — receives Stripe receipts/invoices
  returnUrl: string; // where Stripe returns the super-admin (the account page)
}): Promise<string> {
  const stripe = getStripe();
  const sep = opts.returnUrl.includes("?") ? "&" : "?";
  // The billing contact (who gets Stripe receipts) is the customer's email. For an
  // existing customer, update it so receipts go to the chosen contact, not whoever
  // it was first created as.
  if (opts.stripeCustomerId && opts.contactEmail) {
    await stripe.customers.update(opts.stripeCustomerId, { email: opts.contactEmail }).catch(() => {});
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId, customer_update: { address: "auto" as const } }
      : opts.contactEmail
        ? { customer_email: opts.contactEmail }
        : {}),
    billing_address_collection: "required",
    automatic_tax: { enabled: true },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: opts.accessCents,
          recurring: { interval: "month" },
          tax_behavior: "inclusive",
          product_data: { name: "SetMo — Practice Access", description: "Monthly access per location (tax included)." },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: opts.usageCents,
          recurring: { interval: "month" },
          tax_behavior: "inclusive",
          product_data: {
            name: `SetMo — Monthly Usage (${opts.usageMinutes.toLocaleString()} min)`,
            description: `${opts.usageMinutes.toLocaleString()} practice minutes granted each month (tax included). Hard cap — no overage.`,
          },
        },
      },
    ],
    // subscription metadata drives syncAccess + the per-cycle minute grant.
    subscription_data: {
      metadata: { kind: "access", officeId: opts.officeId, plan: "monthly", usageMinutes: String(opts.usageMinutes), usageCents: String(opts.usageCents) },
    },
    metadata: { kind: "recurring_setup", officeId: opts.officeId },
    success_url: `${opts.returnUrl}${sep}billing=success`,
    cancel_url: `${opts.returnUrl}${sep}billing=cancel`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/**
 * Auto top-up: charge the customer's saved card off-session for `minutes` via a
 * one-off **invoice** with Stripe Tax enabled (so auto top-ups collect sales tax,
 * matching Checkout). Tokens are granted by the `invoice.paid` webhook (kind
 * "minutes_auto"), keeping a single grant path. Returns true if the invoice paid.
 */
export async function chargeMinutesAuto(opts: { officeId: string; customerId: string; minutes: number }): Promise<boolean> {
  const stripe = getStripe();
  const quote = minuteQuote(opts.minutes, await getPricingConfig());
  const { accountTokenDiscountPct } = await import("@/lib/usage");
  const discountPct = await accountTokenDiscountPct(opts.officeId);
  const total = Math.round(quote.total * (1 - discountPct / 100)); // pre-tax token price (account discount applied)
  const tokens = quote.minutes * 10;

  // Find a saved card: the customer's invoice default, else any attached card.
  const customer = (await stripe.customers.retrieve(opts.customerId)) as Stripe.Customer;
  let pm = (customer.invoice_settings?.default_payment_method as string | null) ?? null;
  if (!pm) {
    const list = await stripe.paymentMethods.list({ customer: opts.customerId, type: "card", limit: 1 });
    pm = list.data[0]?.id ?? null;
  }
  if (!pm) return false; // no card on file → can't auto-charge

  // Create the invoice first, bind the line item to it (never a pending/orphan
  // item that could ride the next subscription invoice), finalize to compute tax,
  // then pay off-session. Void on any failure so nothing lingers as owed.
  let invoiceId: string | null = null;
  try {
    const invoice = await stripe.invoices.create({
      customer: opts.customerId,
      collection_method: "charge_automatically",
      auto_advance: false,
      automatic_tax: { enabled: true },
      default_payment_method: pm,
      description: `SetMo — ${tokens.toLocaleString()} tokens (auto top-up)`,
      metadata: { kind: "minutes_auto", officeId: opts.officeId, minutes: String(quote.minutes), amountCents: String(total * 100) },
    });
    invoiceId = invoice.id ?? null;
    if (!invoiceId) return false;
    await stripe.invoiceItems.create({
      customer: opts.customerId,
      invoice: invoiceId,
      amount: total * 100,
      currency: "usd",
      tax_behavior: "exclusive",
      description: `SetMo — ${tokens.toLocaleString()} tokens (auto top-up)`,
    });
    await stripe.invoices.finalizeInvoice(invoiceId);
    const paid = await stripe.invoices.pay(invoiceId, { off_session: true });
    if (paid.status !== "paid") {
      await stripe.invoices.voidInvoice(invoiceId).catch(() => {});
      return false;
    }
    return true; // tokens granted by the invoice.paid webhook (idempotent)
  } catch {
    if (invoiceId) await stripe.invoices.voidInvoice(invoiceId).catch(() => {});
    return false; // declined / requires authentication — admins were already warned
  }
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
