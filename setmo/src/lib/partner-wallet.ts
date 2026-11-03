import { prisma } from "@/lib/db";
import { TOKENS_PER_MINUTE } from "@/lib/pricing";
import type { PartnerMode } from "@/generated/prisma/client";

// ===========================================================================
// PARTNER WALLET — an integration partner (Team Care) bills its own practices,
// and SetMo bills the partner. Every call started through the partner's API
// (Session.partnerId + partnerMode) draws from the partner's wallet in that
// mode, never from the location's own pool (lib/usage excludes them), and the
// location needs no Practice Access of its own.
//
// Additions are PartnerWalletEntry rows (a purchase SetMo billed, a comp, a
// correction). Use is derived from the calls' durations, like the call-center
// pool, so the balance can never drift. TEST and LIVE are separate wallets.
// ===========================================================================

// The same floor every pool uses: a call needs at least a minute left to start.
const MIN_START_SECONDS = 60;

/** 1 token = 6 seconds of practice call. */
export const SECONDS_PER_TOKEN = 60 / TOKENS_PER_MINUTE;

/** Tokens a single partner call used. */
export const callTokens = (durationSeconds: number | null | undefined) => Math.round((durationSeconds ?? 0) / SECONDS_PER_TOKEN);

export type PartnerWallet = {
  mode: PartnerMode;
  addedMinutes: number;
  usedSeconds: number;
  remainingSeconds: number;
  addedTokens: number;
  usedTokens: number;
  /** Can go below zero: a call already under way finishes even past the balance. */
  balanceTokens: number;
};

/** Calls that count against a partner wallet: started through the API in this
 *  mode, finished with a duration, and not given up on (FAILED calls are free). */
export const meteredPartnerCalls = (partnerId: string, mode: PartnerMode) => ({
  partnerId,
  partnerMode: mode,
  isAudit: false,
  kind: { not: "LIVE" as const },
  status: { not: "FAILED" as const },
  durationSeconds: { not: null },
});

export async function getPartnerWallet(partnerId: string, mode: PartnerMode): Promise<PartnerWallet> {
  const [added, used] = await Promise.all([
    prisma.partnerWalletEntry.aggregate({ where: { partnerId, mode }, _sum: { minutes: true } }),
    prisma.session.aggregate({ where: meteredPartnerCalls(partnerId, mode), _sum: { durationSeconds: true } }),
  ]);
  const addedMinutes = added._sum.minutes ?? 0;
  const usedSeconds = used._sum.durationSeconds ?? 0;
  const addedTokens = addedMinutes * TOKENS_PER_MINUTE;
  const usedTokens = Math.round(usedSeconds / SECONDS_PER_TOKEN);
  return {
    mode,
    addedMinutes,
    usedSeconds,
    remainingSeconds: Math.max(0, addedMinutes * 60 - usedSeconds),
    addedTokens,
    usedTokens,
    balanceTokens: addedTokens - usedTokens,
  };
}

/** Pre-call gate for a partner call. */
export async function canStartPartnerCall(partnerId: string, mode: PartnerMode): Promise<{ ok: boolean; remainingSeconds: number }> {
  const w = await getPartnerWallet(partnerId, mode);
  return { ok: w.remainingSeconds > MIN_START_SECONDS, remainingSeconds: w.remainingSeconds };
}

/** Add tokens to a partner wallet (whole minutes underneath; tokens = minutes × 10). */
export async function addPartnerTokens(opts: {
  partnerId: string;
  mode: PartnerMode;
  tokens: number;
  amountCents?: number | null;
  note?: string | null;
  createdById?: string | null;
}) {
  const minutes = Math.round(opts.tokens / TOKENS_PER_MINUTE);
  if (!Number.isFinite(minutes) || minutes === 0) throw new Error("Add at least 10 tokens.");
  const entry = await prisma.partnerWalletEntry.create({
    data: {
      partnerId: opts.partnerId,
      mode: opts.mode,
      minutes,
      amountCents: opts.amountCents ?? null,
      note: opts.note?.trim() || null,
      createdById: opts.createdById ?? null,
    },
  });
  // A top-up re-arms the low-balance emails.
  if (opts.mode === "LIVE") await evaluatePartnerWallet(opts.partnerId).catch(() => {});
  return entry;
}

// Low-balance emails (live wallet only): once when it runs low, once when it's
// empty. "Low" is a fifth of the last top-up, and never under 1,000 tokens.
const LOW_FLOOR_MINUTES = 100;
const EMPTY_MINUTES = 1;

const emails = (rows: { email: string }[]) => Array.from(new Set(rows.map((r) => r.email).filter(Boolean)));

/** The partner's own admins (who buy more), and the SetMo team (who add it). */
async function walletAlertRecipients(partnerId: string): Promise<{ partner: string[]; staff: string[] }> {
  const [partner, staff] = await Promise.all([
    prisma.user.findMany({ where: { status: "ACTIVE", partnerId, role: "PARTNER_ADMIN" }, select: { email: true } }),
    prisma.user.findMany({
      where: { status: "ACTIVE", OR: [{ role: "PLATFORM_ADMIN" }, { memberships: { some: { role: "PLATFORM_ADMIN" } } }] },
      select: { email: true },
    }),
  ]);
  const staffEmails = emails(staff);
  return { partner: emails(partner).filter((e) => !staffEmails.includes(e)), staff: staffEmails };
}

/** Run after a partner call is metered (and from the daily sweep). */
export async function evaluatePartnerWallet(partnerId: string): Promise<void> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, name: true, walletAlertStage: true } });
  if (!partner) return;
  // Only partners that actually run on the API have a wallet worth alerting on.
  const hasWallet = await prisma.partnerWalletEntry.findFirst({ where: { partnerId, mode: "LIVE" }, select: { id: true } });
  if (!hasWallet) return;

  const [wallet, lastTopUp] = await Promise.all([
    getPartnerWallet(partnerId, "LIVE"),
    prisma.partnerWalletEntry.findFirst({ where: { partnerId, mode: "LIVE", minutes: { gt: 0 } }, orderBy: { createdAt: "desc" }, select: { minutes: true } }),
  ]);
  const remainingMin = wallet.remainingSeconds / 60;
  const lowAt = Math.max(LOW_FLOOR_MINUTES, Math.round((lastTopUp?.minutes ?? 0) / 5));

  let stage = 0;
  if (remainingMin <= EMPTY_MINUTES) stage = 2;
  else if (remainingMin <= lowAt) stage = 1;

  if (stage === 0) {
    if (partner.walletAlertStage !== 0) await prisma.partner.update({ where: { id: partnerId }, data: { walletAlertStage: 0 } });
    return;
  }
  if (stage <= partner.walletAlertStage) return;

  const to = await walletAlertRecipients(partnerId);
  const { sendPartnerWalletLowEmail } = await import("@/lib/email");
  const base = { partnerName: partner.name, partnerId, balanceTokens: Math.max(0, wallet.balanceTokens), empty: stage === 2 };
  await sendPartnerWalletLowEmail({ ...base, to: to.partner, audience: "partner" }).catch(() => 0);
  await sendPartnerWalletLowEmail({ ...base, to: to.staff, audience: "staff" }).catch(() => 0);
  await prisma.partner.update({ where: { id: partnerId }, data: { walletAlertStage: stage } });
}

/** Daily safety-net sweep over every partner with a live wallet. */
export async function sweepPartnerWallets(): Promise<{ checked: number }> {
  const partners = await prisma.partnerWalletEntry.findMany({ where: { mode: "LIVE" }, distinct: ["partnerId"], select: { partnerId: true } });
  for (const p of partners) await evaluatePartnerWallet(p.partnerId).catch(() => {});
  return { checked: partners.length };
}
