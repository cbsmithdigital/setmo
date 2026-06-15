import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { constructWebhookEvent } from "@/lib/stripe";
import { currentPeriod } from "@/lib/usage";
import { error, json } from "@/lib/api";

// POST /api/webhooks/stripe — signature-verified billing sync.
// Never grants time before payment is confirmed.
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
      if (session.metadata?.kind === "bundle" && session.payment_status === "paid") {
        await applyBundle(session);
      } else if (session.metadata?.kind === "audit" && session.payment_status === "paid") {
        await activatePaidAudit(session);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await syncSubscription(event.data.object);
      break;
    }
    default:
      break;
  }

  return json({ received: true });
}

async function applyBundle(session: Stripe.Checkout.Session) {
  const officeId = session.metadata?.officeId;
  const hours = Number(session.metadata?.hours ?? 0);
  if (!officeId || !hours) return;

  const paymentRef =
    typeof session.payment_intent === "string" ? session.payment_intent : session.id;

  // Idempotent: skip if this payment already created a bundle.
  const existing = await prisma.conversationBundle.findFirst({
    where: { stripePaymentIntent: paymentRef },
  });
  if (existing) return;

  const minutes = hours * 60;
  await prisma.conversationBundle.create({
    data: {
      officeId,
      hours,
      minutesPurchased: minutes,
      minutesRemaining: minutes,
      stripePaymentIntent: paymentRef,
    },
  });

  // Top up the current pool immediately.
  const period = await currentPeriod(officeId);
  if (period) {
    await prisma.allowancePeriod.update({
      where: { id: period.id },
      data: { bundleSeconds: { increment: BigInt(hours * 3600) } },
    });
  }
}

async function activatePaidAudit(session: Stripe.Checkout.Session) {
  const auditId = session.metadata?.auditId;
  if (!auditId) return;
  const paymentRef = typeof session.payment_intent === "string" ? session.payment_intent : session.id;

  const audit = await prisma.setterAudit.findUnique({ where: { id: auditId } });
  if (!audit || audit.stripePaymentIntent) return; // idempotent

  await prisma.setterAudit.update({
    where: { id: auditId },
    data: {
      approved: true,
      isFree: false,
      stripePaymentIntent: paymentRef,
      // Only open it up if it isn't already finished.
      status: audit.status === "SCORED" ? "SCORED" : "ACTIVE",
    },
  });
}

async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const officeId =
    sub.metadata?.officeId ??
    (customerId
      ? (await prisma.office.findFirst({ where: { stripeCustomerId: customerId } }))?.id
      : undefined);
  if (!officeId) return;

  const item = sub.items.data[0];
  const seats = item?.quantity ?? 1;
  const interval = item?.price?.recurring?.interval;
  const cadence = interval === "year" || interval === "month" ? (interval === "month" ? "MONTHLY" : "QUARTERLY") : "MONTHLY";
  const status = sub.status === "active" ? "ACTIVE" : sub.status === "past_due" ? "PAST_DUE" : "CANCELED";
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;

  await prisma.subscription.upsert({
    where: { officeId },
    update: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      seats,
      cadence,
      status,
      currentPeriodEnd: periodEnd,
    },
    create: {
      officeId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      seats,
      cadence,
      status,
      currentPeriodEnd: periodEnd,
    },
  });

  await prisma.office.update({
    where: { id: officeId },
    data: { seatCount: seats, ...(customerId ? { stripeCustomerId: customerId } : {}) },
  });
}
