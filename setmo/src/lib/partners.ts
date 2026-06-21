import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

// Partner / distribution program. Two tracks (Referral, Distribution), recurring
// rev-share on access + minutes, cash by default or credit (+5%).

export const CREDIT_BONUS_PCT = 5;
export const DISTRIBUTION_THRESHOLD = 10; // > this many active accounts → top rate
export const TAX_1099_THRESHOLD_USD = 599;

type Track = "REFERRAL" | "DISTRIBUTION";
type Payout = "CASH" | "CREDIT";

/** Standard cash base rate before the credit bonus. */
export function baseRatePct(track: Track, activeAccounts: number, customRatePct?: number | null): number {
  if (customRatePct != null) return customRatePct;
  if (track === "REFERRAL") return 15;
  return activeAccounts > DISTRIBUTION_THRESHOLD ? 25 : 20;
}

/** Effective rate %, including the +5% credit bonus when paid as credit. */
export function effectiveRatePct(p: { track: Track; customRatePct?: number | null; payoutMethod: Payout }, activeAccounts: number): number {
  const base = baseRatePct(p.track, activeAccounts, p.customRatePct);
  return p.payoutMethod === "CREDIT" ? base + CREDIT_BONUS_PCT : base;
}

function genCode(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10) || "partner";
  return `${slug}-${randomBytes(3).toString("hex")}`;
}

export async function createPartnerApplication(input: {
  name: string;
  orgType?: string;
  contactName: string;
  email: string;
  audience?: string;
  track: Track;
}) {
  return prisma.partner.create({
    data: {
      name: input.name,
      orgType: input.orgType ?? null,
      contactName: input.contactName,
      email: input.email.trim().toLowerCase(),
      audience: input.audience ?? null,
      track: input.track,
      status: "PENDING",
    },
  });
}

/** Approve a partner and issue an attribution code (idempotent). */
export async function approvePartner(partnerId: string, actorId: string) {
  const partner = await prisma.partner.update({
    where: { id: partnerId },
    data: { status: "APPROVED", approvedAt: new Date(), approvedById: actorId },
  });
  const existing = await prisma.partnerCode.findFirst({ where: { partnerId } });
  if (!existing) {
    let code = genCode(partner.name);
    while (await prisma.partnerCode.findUnique({ where: { code } })) code = genCode(partner.name);
    await prisma.partnerCode.create({ data: { partnerId, code } });
  }
  return partner;
}

export async function setPartnerStatus(partnerId: string, status: "APPROVED" | "DISABLED" | "PENDING") {
  return prisma.partner.update({ where: { id: partnerId }, data: { status } });
}

export async function updatePartnerTerms(partnerId: string, data: { track?: Track; payoutMethod?: Payout; customRatePct?: number | null }) {
  return prisma.partner.update({ where: { id: partnerId }, data });
}

/** Count of a partner's currently-active, paying accounts (drives the rate tier). */
export async function activeAccountCount(partnerId: string): Promise<number> {
  return prisma.office.count({ where: { referredByPartnerId: partnerId, isProspect: false, subscription: { status: "ACTIVE" } } });
}

export type PartnerRow = {
  id: string;
  name: string;
  track: Track;
  status: string;
  orgType: string | null;
  contactName: string | null;
  email: string | null;
  audience: string | null;
  payoutMethod: Payout;
  customRatePct: number | null;
  code: string | null;
  activeAccounts: number;
  rateNow: number;
  pendingCents: number;
  earnedCents: number;
  paidCents: number;
  createdAt: Date;
};

export async function listPartners(): Promise<PartnerRow[]> {
  const partners = await prisma.partner.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { codes: true } });
  const out: PartnerRow[] = [];
  for (const p of partners) {
    const [active, sums] = await Promise.all([
      activeAccountCount(p.id),
      prisma.partnerCommission.groupBy({ by: ["status"], where: { partnerId: p.id }, _sum: { commissionCents: true } }),
    ]);
    const sumOf = (s: string) => sums.find((x) => x.status === s)?._sum.commissionCents ?? 0;
    out.push({
      id: p.id,
      name: p.name,
      track: p.track as Track,
      status: p.status,
      orgType: p.orgType,
      contactName: p.contactName,
      email: p.email,
      audience: p.audience,
      payoutMethod: p.payoutMethod as Payout,
      customRatePct: p.customRatePct,
      code: p.codes[0]?.code ?? null,
      activeAccounts: active,
      rateNow: effectiveRatePct({ track: p.track as Track, customRatePct: p.customRatePct, payoutMethod: p.payoutMethod as Payout }, active),
      pendingCents: sumOf("PENDING"),
      earnedCents: sumOf("EARNED"),
      paidCents: sumOf("PAID"),
      createdAt: p.createdAt,
    });
  }
  return out;
}

/** Resolve a referral code to its partner (for attribution at signup/assessment). */
export async function partnerIdForCode(code: string): Promise<string | null> {
  const row = await prisma.partnerCode.findUnique({ where: { code: code.trim().toLowerCase() }, select: { partnerId: true, partner: { select: { status: true } } } });
  return row && row.partner.status === "APPROVED" ? row.partnerId : null;
}

// ---- commission accrual (fed by the Stripe webhook) ----
const periodKeyNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Record a commissionable charge for an office's referring partner (if any).
 *  Idempotent on stripeRef. `earned` reflects whether the account has cleared
 *  its 2nd payment yet (else PENDING until it does). */
export async function accrueCommission(opts: { officeId: string; kind: "ACCESS" | "MINUTES"; baseCents: number; stripeRef: string; earned: boolean }) {
  if (!opts.baseCents || opts.baseCents <= 0) return;
  const office = await prisma.office.findUnique({ where: { id: opts.officeId }, select: { referredByPartnerId: true } });
  if (!office?.referredByPartnerId) return;
  const partner = await prisma.partner.findUnique({ where: { id: office.referredByPartnerId }, select: { id: true, status: true, track: true, customRatePct: true, payoutMethod: true } });
  if (!partner || partner.status !== "APPROVED") return;
  if (await prisma.partnerCommission.findFirst({ where: { stripeRef: opts.stripeRef } })) return; // idempotent

  const active = await activeAccountCount(partner.id);
  const ratePct = effectiveRatePct({ track: partner.track as Track, customRatePct: partner.customRatePct, payoutMethod: partner.payoutMethod as Payout }, active);
  const commissionCents = Math.round((opts.baseCents * ratePct) / 100);
  await prisma.partnerCommission.create({
    data: { partnerId: partner.id, officeId: opts.officeId, kind: opts.kind, baseAmountCents: opts.baseCents, ratePct, commissionCents, status: opts.earned ? "EARNED" : "PENDING", payoutMethod: partner.payoutMethod, periodKey: periodKeyNow(), stripeRef: opts.stripeRef },
  });
}

/** 2nd payment cleared → all of this office's pending commissions become earned. */
export async function markOfficeCommissionsEarned(officeId: string) {
  await prisma.partnerCommission.updateMany({ where: { officeId, status: "PENDING" }, data: { status: "EARNED" } });
}

/** Refund/cancel before earning → claw back this office's still-pending commissions. */
export async function clawbackOfficeCommissions(officeId: string) {
  await prisma.partnerCommission.updateMany({ where: { officeId, status: "PENDING" }, data: { status: "CLAWED_BACK" } });
}
