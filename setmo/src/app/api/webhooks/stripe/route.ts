import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { constructWebhookEvent, getStripe } from "@/lib/stripe";
import { addMinutes, addOrgTokens, addCallCenterMinutes, grantSignupBonusMinutes } from "@/lib/usage";
import { accrueCommission, markOfficeCommissionsEarned, clawbackOfficeCommissions } from "@/lib/partners";
import { getPricingConfig } from "@/lib/config";
import { captureError } from "@/lib/observability";
import { error, json } from "@/lib/api";

// Account is "earned" for partner commission once it has cleared its 2nd payment.
const EARN_AFTER_PAYMENTS = 2;

// POST /api/webhooks/stripe — signature-verified billing sync + partner accrual.
// Never grants minutes before payment is confirmed.
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(raw, signature);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Invalid signature", 400);
  }

  try {
    switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const kind = session.metadata?.kind;
      // "minutes" = standalone top-up; "activation" = combined access + starter minutes;
      // "access" = access-only activation (sign-up promo grants ride its metadata).
      if ((kind === "minutes" || kind === "activation") && session.payment_status === "paid") {
        await applyMinutes(session);
      } else if (kind === "group_minutes" && session.payment_status === "paid") {
        await applyGroupTokens(session);
      } else if (kind === "callcenter_minutes" && session.payment_status === "paid") {
        await applyCallCenterTokens(session);
      } else if (kind === "access" && session.payment_status === "paid") {
        const officeId = session.metadata?.officeId;
        const bonusMin = Number(session.metadata?.bonusMinutes ?? 0);
        if (officeId && bonusMin > 0) await grantSignupBonusMinutes(officeId, bonusMin);
      }
      break;
    }
    case "invoice.paid": {
      await onInvoicePaid(event.data.object);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncAccess(event.data.object);
      break;
    }
    default:
      break;
    }
  } catch (e) {
    // Capture + 500 so Stripe retries (transient DB/Stripe hiccups recover).
    captureError(e, { scope: "stripe-webhook", type: event.type, eventId: event.id });
    return error("Webhook handler failed", 500);
  }

  return json({ received: true });
}

// One-time minute purchase → append to balance + accrue partner commission.
async function applyMinutes(session: Stripe.Checkout.Session) {
  const officeId = session.metadata?.officeId;
  const minutes = Number(session.metadata?.minutes ?? 0);
  if (!officeId || !minutes) return;

  // Sign-up promo riding an activation checkout → comp bonus ($0, no commission).
  // Granted BEFORE the paid-bundle dedupe below: the grant is idempotent on its
  // own ref, so a Stripe retry after a partial failure still delivers it (after
  // the paid bundle commits, retries short-circuit at the dedupe and would never
  // reach a grant placed later).
  const bonusMin = Number(session.metadata?.bonusMinutes ?? 0);
  if (bonusMin > 0) await grantSignupBonusMinutes(officeId, bonusMin);

  const paymentRef = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
  const existing = await prisma.conversationBundle.findFirst({ where: { stripePaymentIntent: paymentRef } });
  if (existing) return; // idempotent

  // Actual cash for the tokens, pre-tax and POST-promotion-code. For a standalone
  // token purchase the whole session is the token line, so Stripe's amount_subtotal
  // (after discounts/coupons, before tax) is the truth — capturing any coupon. The
  // activation session also bills access, so there we fall back to the computed amount.
  const subtotal = typeof session.amount_subtotal === "number" ? session.amount_subtotal : null;
  const cashCents = session.metadata?.kind === "minutes" && subtotal != null
    ? subtotal
    : Number(session.metadata?.amountCents ?? session.amount_total ?? 0);
  await addMinutes(officeId, minutes, paymentRef, cashCents || undefined);

  const sub = await prisma.subscription.findUnique({ where: { officeId }, select: { paidInvoices: true } });
  await accrueCommission({
    officeId,
    kind: "MINUTES",
    baseCents: cashCents,
    stripeRef: `${paymentRef}:min`,
    earned: (sub?.paidInvoices ?? 0) >= EARN_AFTER_PAYMENTS,
  });
}

// Off-session auto top-up invoice → grant tokens to the office (idempotent).
async function applyAutoTopUpInvoice(invoice: Stripe.Invoice) {
  const officeId = invoice.metadata?.officeId;
  const minutes = Number(invoice.metadata?.minutes ?? 0);
  if (!officeId || !minutes) return;

  const paymentRef = invoice.id;
  if (!paymentRef) return;
  const existing = await prisma.conversationBundle.findFirst({ where: { stripePaymentIntent: paymentRef } });
  if (existing) return; // idempotent

  // Pre-tax token price we set on the line (tax was added on top, exclusive).
  const cashCents = Number(invoice.metadata?.amountCents ?? invoice.subtotal ?? 0);
  await addMinutes(officeId, minutes, paymentRef, cashCents || undefined);

  const sub = await prisma.subscription.findUnique({ where: { officeId }, select: { paidInvoices: true } });
  await accrueCommission({
    officeId,
    kind: "MINUTES",
    baseCents: cashCents,
    stripeRef: `${paymentRef}:min`,
    earned: (sub?.paidInvoices ?? 0) >= EARN_AFTER_PAYMENTS,
  }).catch(() => {});
}

// Group/DSO token purchase → append to the org coach wallet + save the card.
async function applyGroupTokens(session: Stripe.Checkout.Session) {
  const organizationId = session.metadata?.organizationId;
  const minutes = Number(session.metadata?.minutes ?? 0);
  if (!organizationId || !minutes) return;

  const paymentRef = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
  const existing = await prisma.orgTokenBundle.findFirst({ where: { stripePaymentIntent: paymentRef } });
  if (existing) return; // idempotent

  // Actual post-coupon, pre-tax cash (the whole session is the token line).
  const subtotal = typeof session.amount_subtotal === "number" ? session.amount_subtotal : null;
  const cashCents = subtotal ?? Number(session.metadata?.amountCents ?? session.amount_total ?? 0);
  await addOrgTokens(organizationId, minutes, paymentRef, cashCents || undefined);

  // Persist the Stripe customer (a card is now on file for next time).
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (customerId) await prisma.organization.update({ where: { id: organizationId }, data: { stripeCustomerId: customerId } }).catch(() => {});
}

// Call-center pool top-up → append to the pooled practice balance + save the card.
async function applyCallCenterTokens(session: Stripe.Checkout.Session) {
  const organizationId = session.metadata?.organizationId;
  const minutes = Number(session.metadata?.minutes ?? 0);
  if (!organizationId || !minutes) return;

  const paymentRef = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
  const existing = await prisma.callCenterBundle.findFirst({ where: { stripePaymentIntent: paymentRef } });
  if (existing) return; // idempotent

  const subtotal = typeof session.amount_subtotal === "number" ? session.amount_subtotal : null;
  const cashCents = subtotal ?? Number(session.metadata?.amountCents ?? session.amount_total ?? 0);
  await addCallCenterMinutes(organizationId, minutes, paymentRef, cashCents || undefined);

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (customerId) await prisma.organization.update({ where: { id: organizationId }, data: { stripeCustomerId: customerId } }).catch(() => {});
}

// Recurring access payment → count it, flip the 2nd-payment gate, accrue commission.
async function onInvoicePaid(invoice: Stripe.Invoice) {
  // Auto top-up invoice (tax-collected token purchase) → grant tokens, not access.
  if (invoice.metadata?.kind === "minutes_auto") {
    await applyAutoTopUpInvoice(invoice);
    return;
  }

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  // The access subscription row is created by customer.subscription.created (with
  // officeId from metadata) before the first invoice.paid, so match by customer.
  const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { officeId: true, paidInvoices: true, plan: true, usageMinutes: true, usageAmountCents: true } });
  if (!sub) return;

  const count = sub.paidInvoices + 1;
  await prisma.subscription.update({ where: { officeId: sub.officeId }, data: { paidInvoices: count } });

  const earned = count >= EARN_AFTER_PAYMENTS;
  // Base ACCESS commission on the access list price (monthly, or 10× for annual) —
  // not invoice.amount_paid, which includes tax and (on activation) bundled tokens.
  const cfg = await getPricingConfig();
  const accessCents = Math.round(cfg.accessMonthly * (sub.plan === "ANNUAL" ? 10 : 1) * 100);
  await accrueCommission({ officeId: sub.officeId, kind: "ACCESS", baseCents: accessCents, stripeRef: invoice.id ?? `inv:${sub.officeId}:${count}`, earned });
  // Crossing the 2nd payment earns everything that was pending for this account.
  if (count === EARN_AFTER_PAYMENTS) await markOfficeCommissionsEarned(sub.officeId);

  // Super-admin recurring plan: grant this cycle's usage-minute allowance. Keyed
  // on the invoice id so Stripe retries never double-grant.
  if (sub.usageMinutes > 0) {
    try {
      await prisma.conversationBundle.create({
        data: {
          officeId: sub.officeId,
          minutesPurchased: sub.usageMinutes,
          minutesRemaining: sub.usageMinutes,
          hours: Math.round(sub.usageMinutes / 60),
          amountCents: sub.usageAmountCents,
          stripePaymentIntent: `${invoice.id}:allowance`,
        },
      });
    } catch {
      /* unique stripePaymentIntent → this cycle already granted (Stripe retry) */
    }
  }
}

// Flat Practice Access subscription → status + period only (no tiers/seats).
async function syncAccess(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const officeId =
    sub.metadata?.officeId ??
    (customerId ? (await prisma.office.findFirst({ where: { stripeCustomerId: customerId } }))?.id : undefined);
  if (!officeId) return;

  const item = sub.items.data[0];
  // A paused subscription (super-admin "pause access") stays Stripe-active but
  // its collection is voided — treat it as inactive so app access stays revoked.
  const paused = Boolean(sub.pause_collection);
  const status = paused ? "CANCELED" : sub.status === "active" ? "ACTIVE" : sub.status === "past_due" ? "PAST_DUE" : "CANCELED";
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
  // Plan from subscription metadata, else the price interval (year → annual).
  const plan = (sub.metadata?.plan === "annual" || item?.price?.recurring?.interval === "year") ? "ANNUAL" : "MONTHLY";
  // Super-admin recurring plans carry a per-cycle minute allowance in metadata.
  const usageMinutes = Number(sub.metadata?.usageMinutes ?? 0) || 0;
  const usageAmountCents = Number(sub.metadata?.usageCents ?? 0) || 0;

  await prisma.subscription.upsert({
    where: { officeId },
    update: { stripeCustomerId: customerId, stripeSubscriptionId: sub.id, status, currentPeriodEnd: periodEnd, plan, usageMinutes, usageAmountCents },
    create: { officeId, stripeCustomerId: customerId, stripeSubscriptionId: sub.id, status, currentPeriodEnd: periodEnd, plan, usageMinutes, usageAmountCents },
  });
  if (customerId) await prisma.office.update({ where: { id: officeId }, data: { stripeCustomerId: customerId } });

  // Switching plans (e.g. monthly → annual) creates a new sub for the same
  // customer — cancel any other active subs so the office isn't double-billed.
  if (status === "ACTIVE" && customerId) {
    try {
      const others = await getStripe().subscriptions.list({ customer: customerId, status: "active", limit: 10 });
      for (const o of others.data) {
        if (o.id !== sub.id) await getStripe().subscriptions.cancel(o.id).catch(() => {});
      }
    } catch { /* best-effort */ }
  }

  // Lapsed/cancelled before earning → claw back still-pending commissions.
  // A pause isn't a lapse (billing can resume), so don't claw back on pause.
  if (status === "CANCELED" && !paused) await clawbackOfficeCommissions(officeId);
}
