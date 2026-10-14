import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { giftCardAccess } from "@/lib/gift-cards";
import { sendGiftCardRequestAlert } from "@/lib/email";
import { fullName } from "@/lib/format";
import { error, json } from "@/lib/api";

// POST /api/gift-cards/request — an office or group admin asks SetMo to turn on
// gift-card rewards for their account. Records the ask (the super admin sees it
// under "Needs attention" and on the account page) and emails the team, at most
// once a day per account.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const role = getActiveRole(user);

  const asGroup = role === "GROUP_ADMIN" && Boolean(user.organizationId);
  if (!asGroup && !(role === "OFFICE_ADMIN" && user.officeId)) return error("Only an office or group admin can ask for gift cards", 403);

  const scope = asGroup ? { organizationId: user.organizationId } : { officeId: user.officeId };
  const access = await giftCardAccess(scope);
  if (access.enabled) return json({ ok: true, enabled: true });

  const now = new Date();
  const recentlyAsked = access.requestedAt && now.getTime() - access.requestedAt.getTime() < 86400_000;
  let accountId: string;
  let accountName: string;
  if (asGroup) {
    const org = await prisma.organization.update({ where: { id: user.organizationId! }, data: { giftCardsRequestedAt: now }, select: { id: true, name: true } });
    accountId = org.id;
    accountName = org.name;
  } else {
    const office = await prisma.office.update({
      where: { id: user.officeId! },
      data: { giftCardsRequestedAt: now },
      select: { id: true, name: true, organizationId: true, organization: { select: { name: true } } },
    });
    // The platform console pages a group by its organization.
    accountId = office.organizationId ?? office.id;
    accountName = office.organization ? `${office.name} (${office.organization.name})` : office.name;
  }

  if (!recentlyAsked) {
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://setmo.growdental.ai";
    await sendGiftCardRequestAlert({
      accountName,
      requester: fullName(user.firstName, user.lastName) || user.email,
      requesterEmail: user.email,
      manageLink: `${origin}/platform/accounts/${accountId}`,
    });
  }
  return json({ ok: true, requestedAt: now.toISOString() });
}
