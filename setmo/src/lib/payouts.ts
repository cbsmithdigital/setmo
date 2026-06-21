import { prisma } from "@/lib/db";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

// Partner payouts. Cash via Stripe Connect (Express handles W-9 + 1099-NEC);
// credit applied as comp minutes to the partner's linked practice. Run on the
// 1st & 15th. Only EARNED commissions pay out; they flip to PAID.

const CREDIT_RETAIL_PER_MIN = 0.66; // value $ of credit at retail minute price

/** Ensure a Connect account + return an onboarding link for the partner admin. */
export async function getConnectOnboardingUrl(partnerId: string, origin: string): Promise<string | null> {
  if (!isStripeConfigured()) return null;
  const stripe = getStripe();
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { email: true, stripeConnectId: true } });
  if (!partner) return null;
  let acct = partner.stripeConnectId;
  if (!acct) {
    const created = await stripe.accounts.create({ type: "express", email: partner.email ?? undefined, metadata: { partnerId } });
    acct = created.id;
    await prisma.partner.update({ where: { id: partnerId }, data: { stripeConnectId: acct } });
  }
  const link = await stripe.accountLinks.create({
    account: acct,
    refresh_url: `${origin}/partner?connect=refresh`,
    return_url: `${origin}/partner?connect=done`,
    type: "account_onboarding",
  });
  return link.url;
}

/** Refresh the connected account's payout-enabled status (call on return). */
export async function refreshConnectStatus(partnerId: string): Promise<boolean> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { stripeConnectId: true } });
  if (!partner?.stripeConnectId || !isStripeConfigured()) return false;
  try {
    const acct = await getStripe().accounts.retrieve(partner.stripeConnectId);
    const enabled = Boolean(acct.payouts_enabled);
    await prisma.partner.update({ where: { id: partnerId }, data: { connectOnboarded: enabled } });
    return enabled;
  } catch {
    return false;
  }
}

export type PayoutReportRow = { partner: string; method: string; amountCents: number; count: number; status: string; note?: string };

/** Pay out all partners' EARNED commissions. Idempotent-ish per run (only EARNED
 *  rows are touched and flipped to PAID). */
export async function runPartnerPayouts(dryRun = false): Promise<{ runKey: string; rows: PayoutReportRow[]; paidCents: number }> {
  const runKey = new Date().toISOString().slice(0, 10);
  const partners = await prisma.partner.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true, payoutMethod: true, stripeConnectId: true, connectOnboarded: true } });
  const rows: PayoutReportRow[] = [];

  for (const p of partners) {
    const earned = await prisma.partnerCommission.findMany({ where: { partnerId: p.id, status: "EARNED" }, select: { id: true, commissionCents: true } });
    if (!earned.length) continue;
    const amountCents = earned.reduce((a, c) => a + c.commissionCents, 0);
    const ids = earned.map((e) => e.id);

    if (dryRun) {
      rows.push({ partner: p.name, method: p.payoutMethod, amountCents, count: ids.length, status: "DRY" });
      continue;
    }

    let status = "SKIPPED";
    let note: string | undefined;
    let transferId: string | null = null;

    if (p.payoutMethod === "CASH") {
      if (!isStripeConfigured() || !p.stripeConnectId || !p.connectOnboarded) {
        note = "not onboarded for payouts";
      } else {
        try {
          const t = await getStripe().transfers.create({ amount: amountCents, currency: "usd", destination: p.stripeConnectId, metadata: { partnerId: p.id, runKey } });
          transferId = t.id;
          status = "PAID";
        } catch (e) {
          status = "FAILED";
          note = e instanceof Error ? e.message : "transfer failed";
        }
      }
    } else {
      const linked = await prisma.user.findFirst({ where: { partnerId: p.id, officeId: { not: null } }, select: { officeId: true } });
      if (!linked?.officeId) {
        note = "no linked practice for credit";
      } else {
        const minutes = Math.max(1, Math.round(amountCents / 100 / CREDIT_RETAIL_PER_MIN));
        await prisma.conversationBundle.create({ data: { officeId: linked.officeId, minutesPurchased: minutes, minutesRemaining: minutes, hours: Math.round(minutes / 60), amountCents: 0 } });
        status = "PAID";
        note = `${minutes} credit minutes`;
      }
    }

    const payout = await prisma.partnerPayout.create({ data: { partnerId: p.id, amountCents, method: p.payoutMethod, status, commissionCount: ids.length, stripeTransferId: transferId, periodKey: runKey, note: note ?? null } });
    if (status === "PAID") await prisma.partnerCommission.updateMany({ where: { id: { in: ids } }, data: { status: "PAID", payoutId: payout.id } });
    rows.push({ partner: p.name, method: p.payoutMethod, amountCents, count: ids.length, status, note });
  }

  return { runKey, rows, paidCents: rows.filter((r) => r.status === "PAID").reduce((a, r) => a + r.amountCents, 0) };
}

export async function getPartnerPayouts(partnerId: string) {
  return prisma.partnerPayout.findMany({ where: { partnerId }, orderBy: { createdAt: "desc" }, take: 12 });
}
