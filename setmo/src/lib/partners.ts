import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { cleanRefCode, refCodesFromCookie } from "@/lib/referral-cookie";

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

/** Count of a partner's currently-active, paying accounts (drives the rate tier).
 *  Includes offices referred directly AND every office under a referred group/DSO. */
export async function activeAccountCount(partnerId: string): Promise<number> {
  return prisma.office.count({
    where: {
      isProspect: false,
      isDemo: false,
      subscription: { status: "ACTIVE" },
      OR: [{ referredByPartnerId: partnerId }, { organization: { referredByPartnerId: partnerId } }],
    },
  });
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
  commissionsEnabled: boolean;
  hasDemo: boolean;
  code: string | null;
  referredAccounts: number;
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
    const [active, sums, referred] = await Promise.all([
      activeAccountCount(p.id),
      prisma.partnerCommission.groupBy({ by: ["status"], where: { partnerId: p.id }, _sum: { commissionCents: true } }),
      prisma.office.count({ where: { isDemo: false, OR: [{ referredByPartnerId: p.id }, { organization: { referredByPartnerId: p.id } }] } }),
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
      commissionsEnabled: p.commissionsEnabled,
      hasDemo: Boolean(p.demoOrganizationId),
      // The partner's own code, not a rep's.
      code: (p.codes.find((c) => !c.memberUserId) ?? p.codes[0])?.code ?? null,
      referredAccounts: referred,
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

/** A referral code as stored: lowercase letters, digits and dashes only. Links
 *  get pasted into texts and emails, which tack on punctuation ("teamcare."), and
 *  a code that doesn't match exactly is silently unattributed. */
export function normalizeRefCode(code: string | null | undefined): string | null {
  return cleanRefCode(code);
}

// Consumer / ISP mail domains. A partner on one of these shares its domain with
// countless unrelated practices, so the "same domain as the partner" self-referral
// check must not apply to it.
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "yahoo.co.uk", "yahoo.ca",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com", "passport.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "aim.com", "proton.me", "protonmail.com", "pm.me",
  "gmx.com", "gmx.us", "mail.com", "zoho.com", "zohomail.com", "fastmail.com", "hey.com", "yandex.com",
  "comcast.net", "att.net", "sbcglobal.net", "bellsouth.net", "verizon.net", "cox.net", "charter.net",
  "spectrum.net", "earthlink.net", "optonline.net", "frontier.com", "frontiernet.net", "windstream.net",
  "centurylink.net", "q.com", "juno.com", "netzero.net", "roadrunner.com", "twc.com", "rr.com",
  "shaw.ca", "rogers.com", "sympatico.ca", "telus.net", "videotron.ca",
]);

/** Resolve a referral code to its partner (for attribution at signup/assessment). */
export async function partnerIdForCode(code: string): Promise<string | null> {
  const normalized = normalizeRefCode(code);
  if (!normalized) return null;
  const row = await prisma.partnerCode.findUnique({ where: { code: normalized }, select: { partnerId: true, partner: { select: { status: true } } } });
  return row && row.partner.status === "APPROVED" ? row.partnerId : null;
}

/**
 * Resolve the attribution for a new account: the code from the link that brought
 * them here, else the newest code in the tracking cookie that belongs to a real
 * partner (codes that match nobody — another site's ?ref= — are skipped, not
 * fatal). Returns null (no attribution) when the person signing up belongs to the
 * referring partner themselves — a partner or rep trying their own link must not
 * become a "referred practice".
 */
export async function resolveReferral(opts: { code?: string | null; cookieCode?: string | null; email: string }): Promise<{ partnerId: string; code: string } | null> {
  const candidates = [normalizeRefCode(opts.code), ...refCodesFromCookie(opts.cookieCode)].filter((c): c is string => Boolean(c));
  let code: string | null = null;
  let partnerId: string | null = null;
  for (const c of new Set(candidates)) {
    partnerId = await partnerIdForCode(c);
    if (partnerId) {
      code = c;
      break;
    }
  }
  if (!partnerId || !code) return null;

  const email = opts.email.trim().toLowerCase();
  const [partner, partnerUser] = await Promise.all([
    prisma.partner.findUnique({ where: { id: partnerId }, select: { email: true } }),
    prisma.user.findFirst({ where: { email, partnerId: { not: null } }, select: { id: true } }),
  ]);
  if (partnerUser) return null;
  const domain = (e: string | null | undefined) => (e && e.includes("@") ? e.split("@")[1].toLowerCase() : null);
  const partnerDomain = domain(partner?.email);
  if (partnerDomain && !PUBLIC_EMAIL_DOMAINS.has(partnerDomain) && domain(email) === partnerDomain) {
    console.info(`[referral] not crediting ${code}: ${email} shares the partner's email domain`);
    return null;
  }
  return { partnerId, code };
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
  const office = await prisma.office.findUnique({ where: { id: opts.officeId }, select: { referredByPartnerId: true, organization: { select: { referredByPartnerId: true } } } });
  // Office-level referral wins; otherwise inherit the group/DSO's referring partner.
  const referrerId = office?.referredByPartnerId ?? office?.organization?.referredByPartnerId ?? null;
  if (!referrerId) return;
  const partner = await prisma.partner.findUnique({ where: { id: referrerId }, select: { id: true, status: true, track: true, customRatePct: true, payoutMethod: true, commissionsEnabled: true } });
  if (!partner || partner.status !== "APPROVED") return;
  // A tracking-only partner has referrals recorded but earns nothing (yet).
  if (!partner.commissionsEnabled) return;
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
