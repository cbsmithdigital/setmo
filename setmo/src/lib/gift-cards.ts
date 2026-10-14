import { prisma } from "@/lib/db";

// Gift-card rewards are sent by SetMo through Tremendous and paid from SetMo's
// balance, so they stay off until a super admin turns them on for an account.
// Admins ask from the goal builder. On for a group covers all its locations.
// Demo accounts always have them: approving there is recorded, never sent.

export type GiftCardAccess = { enabled: boolean; requestedAt: Date | null; demo: boolean };

const NONE: GiftCardAccess = { enabled: false, requestedAt: null, demo: false };

export async function giftCardAccess(scope: { officeId?: string | null; organizationId?: string | null }): Promise<GiftCardAccess> {
  if (scope.officeId) {
    const o = await prisma.office.findUnique({
      where: { id: scope.officeId },
      select: {
        isDemo: true,
        giftCardsEnabled: true,
        giftCardsRequestedAt: true,
        organization: { select: { isDemo: true, giftCardsEnabled: true, giftCardsRequestedAt: true } },
      },
    });
    if (!o) return NONE;
    const demo = o.isDemo || Boolean(o.organization?.isDemo);
    return {
      enabled: demo || o.giftCardsEnabled || Boolean(o.organization?.giftCardsEnabled),
      requestedAt: o.giftCardsRequestedAt ?? o.organization?.giftCardsRequestedAt ?? null,
      demo,
    };
  }
  if (scope.organizationId) {
    const g = await prisma.organization.findUnique({
      where: { id: scope.organizationId },
      select: { isDemo: true, giftCardsEnabled: true, giftCardsRequestedAt: true },
    });
    if (!g) return NONE;
    return { enabled: g.isDemo || g.giftCardsEnabled, requestedAt: g.giftCardsRequestedAt, demo: g.isDemo };
  }
  return NONE;
}

/** Accounts that asked for gift cards and are still waiting — for the platform
 *  "Needs attention" card. accountId is what /platform/accounts/[id] takes. */
export async function pendingGiftCardRequests(): Promise<{ accountId: string; name: string; requestedAt: Date }[]> {
  const [orgs, offices] = await Promise.all([
    prisma.organization.findMany({
      where: { giftCardsEnabled: false, giftCardsRequestedAt: { not: null }, isDemo: false },
      select: { id: true, name: true, giftCardsRequestedAt: true },
    }),
    prisma.office.findMany({
      where: { giftCardsEnabled: false, giftCardsRequestedAt: { not: null }, isDemo: false, OR: [{ organizationId: null }, { organization: { giftCardsEnabled: false } }] },
      select: { id: true, name: true, organizationId: true, giftCardsRequestedAt: true, organization: { select: { name: true } } },
    }),
  ]);
  const byAccount = new Map<string, { accountId: string; name: string; requestedAt: Date }>();
  for (const g of orgs) byAccount.set(g.id, { accountId: g.id, name: g.name, requestedAt: g.giftCardsRequestedAt! });
  for (const o of offices) {
    const accountId = o.organizationId ?? o.id;
    const prev = byAccount.get(accountId);
    if (!prev || prev.requestedAt < o.giftCardsRequestedAt!) {
      byAccount.set(accountId, { accountId, name: o.organization?.name ?? o.name, requestedAt: o.giftCardsRequestedAt! });
    }
  }
  return [...byAccount.values()].sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
}
