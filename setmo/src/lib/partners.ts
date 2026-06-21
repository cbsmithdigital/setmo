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
