import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { constructWebhookEvent } from "@/lib/stripe";
import { addMinutes } from "@/lib/usage";
import { error, json } from "@/lib/api";

// POST /api/webhooks/stripe — signature-verified billing sync.
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
      if (session.metadata?.kind === "minutes" && session.payment_status === "paid") {
        await applyMinutes(session);
      }
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

// One-time minute purchase → append to the location's rolling balance.
async function applyMinutes(session: Stripe.Checkout.Session) {
  const officeId = session.metadata?.officeId;
  const minutes = Number(session.metadata?.minutes ?? 0);
  if (!officeId || !minutes) return;

  const paymentRef = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
  const existing = await prisma.conversationBundle.findFirst({ where: { stripePaymentIntent: paymentRef } });
  if (existing) return; // idempotent

  await addMinutes(officeId, minutes, paymentRef);
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
}
