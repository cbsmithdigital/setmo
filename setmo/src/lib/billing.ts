import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { addMinutes } from "@/lib/usage";
import { accrueCommission, EARN_AFTER_PAYMENTS } from "@/lib/partners";
import { sendBillingAlert } from "@/lib/email";

// Billing steps shared by the Stripe webhook and the off-session charges, plus
// what happens when a payment is refunded or disputed.

/** The subscription an invoice belongs to (newer Stripe API: under `parent`). */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  return typeof sub === "string" ? sub : sub?.id ?? null;
}

/**
 * Grant an auto top-up's tokens (plus its partner commission). Called when the
 * charge comes back paid and again by the invoice.paid webhook — whichever is
 * first grants; the bundle's unique payment ref makes the other a no-op, so a
 * late or missing webhook can't leave a paid top-up without its tokens.
 */
export async function grantAutoTopUp(invoice: { id?: string | null; metadata?: Stripe.Metadata | null; subtotal?: number | null }): Promise<void> {
  const officeId = invoice.metadata?.officeId;
  const minutes = Number(invoice.metadata?.minutes ?? 0);
  const paymentRef = invoice.id;
  if (!officeId || !minutes || !paymentRef) return;
  if (await prisma.conversationBundle.findFirst({ where: { stripePaymentIntent: paymentRef }, select: { id: true } })) return;

  // Pre-tax token price we set on the line (tax was added on top, exclusive).
  const cashCents = Number(invoice.metadata?.amountCents ?? invoice.subtotal ?? 0);
  try {
    await addMinutes(officeId, minutes, paymentRef, cashCents || undefined);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return; // the other path got there first
    throw e;
  }
  const sub = await prisma.subscription.findUnique({ where: { officeId }, select: { paidInvoices: true } });
  await accrueCommission({
    officeId,
    kind: "MINUTES",
    baseCents: cashCents,
    stripeRef: `${paymentRef}:min`,
    earned: (sub?.paidInvoices ?? 0) >= EARN_AFTER_PAYMENTS,
  }).catch(() => {});
}

// ---- refunds & disputes ----

type FoundBundle = { table: "office" | "group" | "callcenter"; id: string; ownerId: string; minutes: number; amountCents: number | null };

/** What a charge paid for: the token bundles it bought and the commission refs
 *  it earned. A charge links to its payment intent; an invoice payment (access,
 *  an activation's starter tokens, an auto top-up, a recurring allowance) is
 *  traced to its invoice, and an activation to the checkout that keyed it. */
async function whatChargeBought(charge: Stripe.Charge): Promise<{ refs: string[]; bundles: FoundBundle[]; officeIds: string[] }> {
  const stripe = getStripe();
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
  const refs = new Set<string>();
  if (pi) {
    refs.add(pi);
    refs.add(`${pi}:min`);
    const paid = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: pi }, limit: 1 }).catch(() => null);
    const inv = paid?.data[0]?.invoice;
    const invoiceId = typeof inv === "string" ? inv : inv?.id ?? null;
    if (invoiceId) {
      refs.add(invoiceId);
      refs.add(`${invoiceId}:min`);
      refs.add(`${invoiceId}:allowance`);
      const invoice = await stripe.invoices.retrieve(invoiceId).catch(() => null);
      const subId = invoice ? invoiceSubscriptionId(invoice) : null;
      if (subId) {
        const sessions = await stripe.checkout.sessions.list({ subscription: subId, limit: 5 }).catch(() => null);
        for (const s of sessions?.data ?? []) {
          refs.add(s.id);
          refs.add(`${s.id}:min`);
        }
      }
    }
  }
  const keys = [...refs];
  const [office, group, cc, commissions] = await Promise.all([
    prisma.conversationBundle.findMany({ where: { stripePaymentIntent: { in: keys } }, select: { id: true, officeId: true, minutesPurchased: true, amountCents: true } }),
    prisma.orgTokenBundle.findMany({ where: { stripePaymentIntent: { in: keys } }, select: { id: true, organizationId: true, minutesPurchased: true, amountCents: true } }),
    prisma.callCenterBundle.findMany({ where: { stripePaymentIntent: { in: keys } }, select: { id: true, organizationId: true, minutesPurchased: true, amountCents: true } }),
    prisma.partnerCommission.findMany({ where: { stripeRef: { in: keys } }, select: { officeId: true } }),
  ]);
  const bundles: FoundBundle[] = [
    ...office.map((b) => ({ table: "office" as const, id: b.id, ownerId: b.officeId, minutes: b.minutesPurchased, amountCents: b.amountCents })),
    ...group.map((b) => ({ table: "group" as const, id: b.id, ownerId: b.organizationId, minutes: b.minutesPurchased, amountCents: b.amountCents })),
    ...cc.map((b) => ({ table: "callcenter" as const, id: b.id, ownerId: b.organizationId, minutes: b.minutesPurchased, amountCents: b.amountCents })),
  ];
  const officeIds = [...new Set([...office.map((b) => b.officeId), ...commissions.map((c) => c.officeId)])];
  return { refs: keys, bundles, officeIds };
}

/** Commissions earned on these refs, cut to what wasn't refunded (gone entirely
 *  on a full refund). One already paid out can't be pulled back here — it's
 *  listed for the alert. Recomputed from the base each time, so a second
 *  partial refund lands on the right number. */
async function adjustCommissions(refs: string[], refundedFraction: number): Promise<{ adjusted: number; alreadyPaid: number }> {
  const rows = await prisma.partnerCommission.findMany({ where: { stripeRef: { in: refs } } });
  let adjusted = 0;
  let alreadyPaid = 0;
  for (const c of rows) {
    if (c.status === "PAID") { alreadyPaid += c.commissionCents; continue; }
    if (c.status === "CLAWED_BACK") continue;
    if (refundedFraction >= 0.999) {
      await prisma.partnerCommission.update({ where: { id: c.id }, data: { status: "CLAWED_BACK" } });
    } else {
      await prisma.partnerCommission.update({ where: { id: c.id }, data: { commissionCents: Math.round((c.baseAmountCents * (1 - refundedFraction) * c.ratePct) / 100) } });
    }
    adjusted++;
  }
  return { adjusted, alreadyPaid };
}

const tokens = (minutes: number) => (minutes * 10).toLocaleString();

/**
 * A refund (full or partial; Stripe reports the running total). The tokens the
 * refunded share bought come back out of the balance — as a reversing bundle
 * row keyed to the charge, updated on a later partial refund — and the partner
 * commission shrinks to match. The team gets an email either way.
 */
export async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  if (!charge.amount || !charge.amount_refunded) return;
  const fraction = Math.min(1, charge.amount_refunded / charge.amount);
  const { refs, bundles, officeIds } = await whatChargeBought(charge);

  const lines: string[] = [];
  for (const b of bundles) {
    const minutes = -Math.round(b.minutes * fraction);
    const cents = -Math.round((b.amountCents ?? 0) * fraction);
    const ref = `refund:${charge.id}:${b.id}`;
    if (b.table === "office") {
      await prisma.conversationBundle.upsert({
        where: { stripePaymentIntent: ref },
        create: { officeId: b.ownerId, minutesPurchased: minutes, minutesRemaining: 0, hours: 0, amountCents: cents, stripePaymentIntent: ref },
        update: { minutesPurchased: minutes, amountCents: cents },
      });
    } else if (b.table === "group") {
      const existing = await prisma.orgTokenBundle.findFirst({ where: { stripePaymentIntent: ref }, select: { id: true } });
      if (existing) await prisma.orgTokenBundle.update({ where: { id: existing.id }, data: { minutesPurchased: minutes, amountCents: cents } });
      else await prisma.orgTokenBundle.create({ data: { organizationId: b.ownerId, minutesPurchased: minutes, amountCents: cents, stripePaymentIntent: ref } });
    } else {
      const existing = await prisma.callCenterBundle.findFirst({ where: { stripePaymentIntent: ref }, select: { id: true } });
      if (existing) await prisma.callCenterBundle.update({ where: { id: existing.id }, data: { minutesPurchased: minutes, amountCents: cents } });
      else await prisma.callCenterBundle.create({ data: { organizationId: b.ownerId, minutesPurchased: minutes, amountCents: cents, stripePaymentIntent: ref } });
    }
    lines.push(`Removed ${tokens(-minutes)} tokens bought with this payment.`);
  }
  const { adjusted, alreadyPaid } = await adjustCommissions(refs, fraction);
  if (adjusted) lines.push(`Adjusted ${adjusted} partner commission${adjusted === 1 ? "" : "s"} to match.`);
  if (alreadyPaid) lines.push(`$${(alreadyPaid / 100).toFixed(2)} of commission on this payment was already paid to the partner — recover it by hand if you need to.`);
  if (!bundles.length) lines.push("No tokens were tied to this payment (access only), so the balance is unchanged.");

  const where = await accountNames(officeIds);
  await sendBillingAlert({
    subject: `Refund processed${where ? ` — ${where}` : ""}: $${(charge.amount_refunded / 100).toFixed(2)}`,
    heading: fraction >= 0.999 ? "A payment was refunded in full" : "A payment was partly refunded",
    lines: [`$${(charge.amount_refunded / 100).toFixed(2)} of $${(charge.amount / 100).toFixed(2)} refunded${where ? ` for ${where}` : ""}.`, ...lines],
  }).catch(() => {});
}

/**
 * A dispute (chargeback). Commissions on the payment that haven't been paid are
 * held back (clawed back), and the team is emailed to decide about the tokens —
 * a dispute can still be won, so they aren't pulled automatically.
 */
export async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const charge = await getStripe().charges.retrieve(chargeId);
  const { refs, bundles, officeIds } = await whatChargeBought(charge);
  const { adjusted, alreadyPaid } = await adjustCommissions(refs, 1);
  const where = await accountNames(officeIds);
  const bought = bundles.reduce((a, b) => a + b.minutes, 0);
  await sendBillingAlert({
    subject: `Payment disputed${where ? ` — ${where}` : ""}: $${(dispute.amount / 100).toFixed(2)}`,
    heading: "A customer disputed a payment",
    lines: [
      `$${(dispute.amount / 100).toFixed(2)} disputed${where ? ` for ${where}` : ""} (reason: ${dispute.reason.replace(/_/g, " ")}). Respond in the Stripe dashboard.`,
      bought ? `This payment bought ${tokens(bought)} tokens. They're still on the account — remove them from the platform console if the dispute is lost.` : "No tokens were tied to this payment.",
      ...(adjusted ? [`Held back ${adjusted} unpaid partner commission${adjusted === 1 ? "" : "s"} on it.`] : []),
      ...(alreadyPaid ? [`$${(alreadyPaid / 100).toFixed(2)} of commission on it was already paid out.`] : []),
    ],
  }).catch(() => {});
}

async function accountNames(officeIds: string[]): Promise<string> {
  if (!officeIds.length) return "";
  const offices = await prisma.office.findMany({ where: { id: { in: officeIds } }, select: { name: true } });
  return offices.map((o) => o.name).join(", ");
}
