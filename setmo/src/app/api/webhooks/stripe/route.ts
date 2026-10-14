import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { constructWebhookEvent, getStripe } from "@/lib/stripe";
import { addMinutes, addOrgTokens, addCallCenterMinutes, grantSignupBonusMinutes } from "@/lib/usage";
import { accrueCommission, markOfficeCommissionsEarned, clawbackOfficeCommissions, EARN_AFTER_PAYMENTS } from "@/lib/partners";
import { grantAutoTopUp, handleChargeRefunded, handleDisputeCreated, invoiceSubscriptionId } from "@/lib/billing";
import { getPricingConfig } from "@/lib/config";
import { captureError } from "@/lib/observability";
import { error, json } from "@/lib/api";

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

  // Each event once. Stripe redelivers (timeouts, retries), and counting a paid
  // invoice twice would earn partner commissions early. The claim is released
  // if handling fails, so Stripe's retry runs it again.
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return json({ received: true, duplicate: true });
    throw e;
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
    case "charge.refunded": {
      await handleChargeRefunded(event.data.object);
      break;
    }
    case "charge.dispute.created": {
      await handleDisputeCreated(event.data.object);
      break;
    }
    default:
      break;
    }
  } catch (e) {
    // Capture + 500 so Stripe retries (transient DB/Stripe hiccups recover).
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
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
    await grantAutoTopUp(invoice);
    return;
  }

  // Bring the office's subscription row up to date from Stripe first: events
  // arrive in any order, and this invoice may be the first word of a new
  // subscription (an activation, a plan switch, a super-admin recurring plan).
  const subId = invoiceSubscriptionId(invoice);
  const liveSub = subId ? await getStripe().subscriptions.retrieve(subId).catch(() => null) : null;
  if (liveSub) await syncAccess(liveSub);

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { officeId: true, paidInvoices: true, plan: true } });
  if (!sub) {
    // A subscription invoice for an office we can't place yet: fail so Stripe
    // retries once the subscription's own event has landed. Anything else isn't ours.
    if (liveSub?.metadata?.officeId) throw new Error(`invoice.paid before its subscription row: ${invoice.id}`);
    return;
  }

  const count = sub.paidInvoices + 1;
  await prisma.subscription.update({ where: { officeId: sub.officeId }, data: { paidInvoices: count } });

  const earned = count >= EARN_AFTER_PAYMENTS;
  // Base ACCESS commission on the access list price (monthly, or 10× for annual) —
  // not invoice.amount_paid, which includes tax and (on activation) bundled tokens.
  // A $0 invoice (a 100%-off coupon) brought in no money, so it earns the partner
  // nothing — but it still counts toward the payments above, so commission
  // starts on the payments that follow (Adam, 2026-10-14).
  if ((invoice.amount_paid ?? 0) > 0) {
    const cfg = await getPricingConfig();
    const accessCents = Math.round(cfg.accessMonthly * (sub.plan === "ANNUAL" ? 10 : 1) * 100);
    await accrueCommission({ officeId: sub.officeId, kind: "ACCESS", baseCents: accessCents, stripeRef: invoice.id ?? `inv:${sub.officeId}:${count}`, earned });
  }
  // Crossing the 2nd payment earns everything that was pending for this account.
  if (count === EARN_AFTER_PAYMENTS) await markOfficeCommissionsEarned(sub.officeId);

  // Super-admin recurring plan: grant this cycle's usage-minute allowance. Read
  // from the subscription this invoice paid (not the row, which may have been
  // another plan's a moment ago). Keyed on the invoice id so Stripe retries
  // never double-grant.
  const usageMinutes = Number(liveSub?.metadata?.usageMinutes ?? 0) || 0;
  const usageAmountCents = Number(liveSub?.metadata?.usageCents ?? 0) || 0;
  if (usageMinutes > 0) {
    try {
      await prisma.conversationBundle.create({
        data: {
          officeId: sub.officeId,
          minutesPurchased: usageMinutes,
          minutesRemaining: usageMinutes,
          hours: Math.round(usageMinutes / 60),
          amountCents: usageAmountCents,
          stripePaymentIntent: `${invoice.id}:allowance`,
        },
      });
    } catch {
      /* unique stripePaymentIntent → this cycle already granted (Stripe retry) */
    }
  }
}

const LIVE_STATUSES: Stripe.Subscription.Status[] = ["active", "trialing", "past_due"];

// Flat Practice Access subscription → status + period only (no tiers/seats).
//
// Worked out from Stripe's live state, not the event alone: deliveries arrive
// out of order, and a plan switch (monthly → annual, or a super-admin recurring
// plan) briefly leaves two subscriptions. The newest live one is the office's;
// an older one still live is the plan being replaced and is cancelled, and the
// replaced plan's cancellation never marks the office cancelled or claws back
// its partner's commissions.
async function syncAccess(eventSub: Stripe.Subscription) {
  const customerId = typeof eventSub.customer === "string" ? eventSub.customer : eventSub.customer?.id;
  const officeId =
    eventSub.metadata?.officeId ??
    (customerId ? (await prisma.office.findFirst({ where: { stripeCustomerId: customerId } }))?.id : undefined);
  if (!officeId) return;

  let subs: Stripe.Subscription[] = [eventSub];
  if (customerId) {
    const listed = await getStripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    // This office's subscriptions (one customer is one office; the metadata check
    // keeps anything else on the customer out).
    subs = listed.data.filter((s) => !s.metadata?.officeId || s.metadata.officeId === officeId);
    if (!subs.some((s) => s.id === eventSub.id)) subs.push(eventSub);
  }
  const byNewest = [...subs].sort((a, b) => b.created - a.created);
  const live = byNewest.filter((s) => LIVE_STATUSES.includes(s.status));
  const sub = live[0] ?? byNewest[0];

  const item = sub.items.data[0];
  // A paused subscription (super-admin "pause access") stays Stripe-active but
  // its collection is voided — treat it as inactive so app access stays revoked.
  const paused = Boolean(sub.pause_collection);
  const status = paused ? "CANCELED" : sub.status === "active" || sub.status === "trialing" ? "ACTIVE" : sub.status === "past_due" ? "PAST_DUE" : "CANCELED";
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

  // Switching plans: once the new one is paid and running, cancel the older live
  // ones so the office isn't double-billed.
  if (sub.status === "active" && !paused) {
    for (const old of live.slice(1)) {
      await getStripe().subscriptions.cancel(old.id).catch(() => {});
    }
  }

  // Lapsed/cancelled before earning → claw back still-pending commissions — only
  // when nothing live is left (a replaced plan isn't a lapse), and never on a
  // pause (billing can resume).
  if (status === "CANCELED" && !paused && live.length === 0) await clawbackOfficeCommissions(officeId);
}
