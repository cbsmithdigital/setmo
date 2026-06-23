import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { constructWebhookEvent } from "@/lib/stripe";
import { addMinutes } from "@/lib/usage";
import { accrueCommission, markOfficeCommissionsEarned, clawbackOfficeCommissions } from "@/lib/partners";
import { getPricingConfig } from "@/lib/config";
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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const kind = session.metadata?.kind;
      // "minutes" = standalone top-up; "activation" = combined access + starter minutes.
      if ((kind === "minutes" || kind === "activation") && session.payment_status === "paid") {
        await applyMinutes(session);
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

  return json({ received: true });
}

// One-time minute purchase → append to balance + accrue partner commission.
async function applyMinutes(session: Stripe.Checkout.Session) {
  const officeId = session.metadata?.officeId;
  const minutes = Number(session.metadata?.minutes ?? 0);
  if (!officeId || !minutes) return;

  const paymentRef = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
  const existing = await prisma.conversationBundle.findFirst({ where: { stripePaymentIntent: paymentRef } });
  if (existing) return; // idempotent

  await addMinutes(officeId, minutes, paymentRef);

  const sub = await prisma.subscription.findUnique({ where: { officeId }, select: { paidInvoices: true } });
  await accrueCommission({
    officeId,
    kind: "MINUTES",
    // Pre-tax minutes cost (set at checkout); for activation this excludes the access line.
    baseCents: Number(session.metadata?.amountCents ?? session.amount_total ?? 0),
    stripeRef: `${paymentRef}:min`,
    earned: (sub?.paidInvoices ?? 0) >= EARN_AFTER_PAYMENTS,
  });
}

// Recurring access payment → count it, flip the 2nd-payment gate, accrue commission.
async function onInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;
  // The access subscription row is created by customer.subscription.created (with
  // officeId from metadata) before the first invoice.paid, so match by customer.
  const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { officeId: true, paidInvoices: true } });
  if (!sub) return;

  const count = sub.paidInvoices + 1;
  await prisma.subscription.update({ where: { officeId: sub.officeId }, data: { paidInvoices: count } });

  const earned = count >= EARN_AFTER_PAYMENTS;
  // Base ACCESS commission on the access list price — not invoice.amount_paid,
  // which now includes tax and (on the first activation invoice) bundled minutes.
  const cfg = await getPricingConfig();
  await accrueCommission({ officeId: sub.officeId, kind: "ACCESS", baseCents: Math.round(cfg.accessMonthly * 100), stripeRef: invoice.id ?? `inv:${sub.officeId}:${count}`, earned });
  // Crossing the 2nd payment earns everything that was pending for this account.
  if (count === EARN_AFTER_PAYMENTS) await markOfficeCommissionsEarned(sub.officeId);
}

// Flat Practice Access subscription → status + period only (no tiers/seats).
async function syncAccess(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const officeId =
    sub.metadata?.officeId ??
    (customerId ? (await prisma.office.findFirst({ where: { stripeCustomerId: customerId } }))?.id : undefined);
  if (!officeId) return;

  const item = sub.items.data[0];
  const status = sub.status === "active" ? "ACTIVE" : sub.status === "past_due" ? "PAST_DUE" : "CANCELED";
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;

  await prisma.subscription.upsert({
    where: { officeId },
    update: { stripeCustomerId: customerId, stripeSubscriptionId: sub.id, status, currentPeriodEnd: periodEnd },
    create: { officeId, stripeCustomerId: customerId, stripeSubscriptionId: sub.id, status, currentPeriodEnd: periodEnd },
  });
  if (customerId) await prisma.office.update({ where: { id: officeId }, data: { stripeCustomerId: customerId } });

  // Lapsed/cancelled before earning → claw back still-pending commissions.
  if (status === "CANCELED") await clawbackOfficeCommissions(officeId);
}
