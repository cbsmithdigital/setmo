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

/**
 * Pay out all partners' EARNED commissions. Safe to run twice at once (the cron
 * plus a manual run): each partner's commissions are claimed for one payout row
 * before any money moves, the Stripe transfer carries that payout's id as its
 * idempotency key, and a run that died mid-transfer is settled at the start of
 * the next one.
 */
export async function runPartnerPayouts(dryRun = false): Promise<{ runKey: string; rows: PayoutReportRow[]; paidCents: number }> {
  const runKey = new Date().toISOString().slice(0, 10);
  if (!dryRun) await settleInterruptedPayouts();
  // Tracking-only partners (commissionsEnabled=false) are never paid.
  const partners = await prisma.partner.findMany({ where: { status: "APPROVED", commissionsEnabled: true }, select: { id: true, name: true, payoutMethod: true, stripeConnectId: true, connectOnboarded: true } });
  const rows: PayoutReportRow[] = [];

  for (const p of partners) {
    const earned = await prisma.partnerCommission.findMany({ where: { partnerId: p.id, status: "EARNED", payoutId: null }, select: { id: true, commissionCents: true } });
    if (!earned.length) continue;
    // Nothing owed → nothing to pay (a $0 batch used to write a payout row and
    // grant a minimum 1 credit minute).
    if (earned.reduce((a, c) => a + c.commissionCents, 0) <= 0) continue;

    if (dryRun) {
      rows.push({ partner: p.name, method: p.payoutMethod, amountCents: earned.reduce((a, c) => a + c.commissionCents, 0), count: earned.length, status: "DRY" });
      continue;
    }

    // Claim first: these commissions belong to this payout now, so an
    // overlapping run finds nothing left to pay.
    const payout = await prisma.partnerPayout.create({ data: { partnerId: p.id, amountCents: 0, method: p.payoutMethod, status: "PROCESSING", commissionCount: 0, periodKey: runKey } });
    await prisma.partnerCommission.updateMany({ where: { id: { in: earned.map((e) => e.id) }, status: "EARNED", payoutId: null }, data: { payoutId: payout.id } });
    const mine = await prisma.partnerCommission.findMany({ where: { payoutId: payout.id }, select: { commissionCents: true } });
    const amountCents = mine.reduce((a, c) => a + c.commissionCents, 0);
    if (!mine.length || amountCents <= 0) {
      await releaseClaim(payout.id);
      await prisma.partnerPayout.delete({ where: { id: payout.id } });
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
          const t = await getStripe().transfers.create(
            { amount: amountCents, currency: "usd", destination: p.stripeConnectId, metadata: { partnerId: p.id, runKey, payoutId: payout.id } },
            { idempotencyKey: `payout:${payout.id}` },
          );
          transferId = t.id;
          status = "PAID";
        } catch (e) {
          status = "FAILED";
          note = e instanceof Error ? e.message : "transfer failed";
        }
      }
    } else {
      // Credit lands in the partner ADMIN's own real practice — never a demo
      // account, and never whichever rep Prisma happens to return first.
      const linked = await prisma.user.findFirst({
        where: { partnerId: p.id, officeId: { not: null }, office: { isDemo: false }, OR: [{ role: "PARTNER_ADMIN" }, { memberships: { some: { role: "PARTNER_ADMIN" } } }] },
        select: { officeId: true },
      });
      if (!linked?.officeId) {
        note = "no linked practice for credit";
      } else {
        const minutes = Math.max(1, Math.round(amountCents / 100 / CREDIT_RETAIL_PER_MIN));
        // Keyed to the payout, so the credit can't be granted twice either.
        await prisma.conversationBundle.upsert({
          where: { stripePaymentIntent: `payout:${payout.id}` },
          create: { officeId: linked.officeId, minutesPurchased: minutes, minutesRemaining: minutes, hours: Math.round(minutes / 60), amountCents: 0, stripePaymentIntent: `payout:${payout.id}` },
          update: {},
        });
        status = "PAID";
        note = `${minutes} credit minutes`;
      }
    }

    await prisma.partnerPayout.update({ where: { id: payout.id }, data: { amountCents, status, commissionCount: mine.length, stripeTransferId: transferId, note: note ?? null } });
    if (status === "PAID") await prisma.partnerCommission.updateMany({ where: { payoutId: payout.id }, data: { status: "PAID" } });
    else await releaseClaim(payout.id); // not paid → back in the queue for next time
    rows.push({ partner: p.name, method: p.payoutMethod, amountCents, count: mine.length, status, note });
  }

  return { runKey, rows, paidCents: rows.filter((r) => r.status === "PAID").reduce((a, r) => a + r.amountCents, 0) };
}

/** Put a payout's claimed (still unpaid) commissions back in the queue. */
async function releaseClaim(payoutId: string) {
  await prisma.partnerCommission.updateMany({ where: { payoutId, status: "EARNED" }, data: { payoutId: null } });
}

/**
 * A run that died between claiming and recording leaves a PROCESSING payout.
 * If its transfer went through (found by the payout id in its metadata), finish
 * recording it as paid; otherwise release its commissions for this run.
 */
async function settleInterruptedPayouts() {
  const stuck = await prisma.partnerPayout.findMany({
    where: { status: "PROCESSING", createdAt: { lt: new Date(Date.now() - 15 * 60_000) } },
    include: { partner: { select: { stripeConnectId: true } } },
  });
  for (const payout of stuck) {
    let transferId: string | null = null;
    if (payout.method === "CASH" && payout.partner.stripeConnectId && isStripeConfigured()) {
      const recent = await getStripe().transfers.list({ destination: payout.partner.stripeConnectId, limit: 20 }).catch(() => null);
      transferId = recent?.data.find((t) => t.metadata?.payoutId === payout.id)?.id ?? null;
    }
    const credited = payout.method !== "CASH" && (await prisma.conversationBundle.findUnique({ where: { stripePaymentIntent: `payout:${payout.id}` }, select: { id: true } }));
    if (transferId || credited) {
      const mine = await prisma.partnerCommission.findMany({ where: { payoutId: payout.id }, select: { commissionCents: true } });
      await prisma.partnerPayout.update({ where: { id: payout.id }, data: { status: "PAID", stripeTransferId: transferId, amountCents: mine.reduce((a, c) => a + c.commissionCents, 0), commissionCount: mine.length, note: "settled after an interrupted run" } });
      await prisma.partnerCommission.updateMany({ where: { payoutId: payout.id }, data: { status: "PAID" } });
    } else {
      await releaseClaim(payout.id);
      await prisma.partnerPayout.update({ where: { id: payout.id }, data: { status: "FAILED", note: "interrupted before paying; commissions returned to the queue" } });
    }
  }
}

export async function getPartnerPayouts(partnerId: string) {
  return prisma.partnerPayout.findMany({ where: { partnerId }, orderBy: { createdAt: "desc" }, take: 12 });
}
