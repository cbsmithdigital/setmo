import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { isEmailConfigured, sendPartnerInvite } from "@/lib/email";
import { getMinuteBalance } from "@/lib/usage";
import { fullName } from "@/lib/format";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://setmo.growdental.ai";
const refLink = (code: string) => `${appUrl()}/audit?ref=${code}`;

function genCode(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10) || "rep";
  return `${slug}-${randomBytes(3).toString("hex")}`;
}
async function uniqueCode(name: string): Promise<string> {
  let code = genCode(name);
  while (await prisma.partnerCode.findUnique({ where: { code } })) code = genCode(name);
  return code;
}

// On approval: link/create the Partner Admin login from the partner's contact.
// Returns an invite link if email isn't configured (so the admin can hand it over).
export async function ensurePartnerAdminUser(partnerId: string): Promise<{ inviteLink?: string }> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner?.email) return {};
  const email = partner.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Dual identity — keep their login, add the partner role + link.
    await prisma.user.update({ where: { id: existing.id }, data: { partnerId } });
    await prisma.membership.upsert({
      where: { userId_role_scopeId: { userId: existing.id, role: "PARTNER_ADMIN", scopeId: partnerId } },
      update: {},
      create: { userId: existing.id, role: "PARTNER_ADMIN", scopeType: "PARTNER", scopeId: partnerId },
    });
    return {};
  }
  if (!isAdminConfigured()) return {};

  const admin = getAdminClient();
  const redirectTo = `${appUrl()}/auth/confirm?next=/partner`;
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
  if (error || !data?.user) return {};
  const [firstName, ...rest] = (partner.contactName ?? "").trim().split(/\s+/);
  await prisma.user.create({
    data: { id: data.user.id, email, firstName: firstName || null, lastName: rest.join(" ") || null, role: "PARTNER_ADMIN", status: "INVITED", partnerId },
  });
  await prisma.membership.create({ data: { userId: data.user.id, role: "PARTNER_ADMIN", scopeType: "PARTNER", scopeId: partnerId } });

  const link = data.properties?.action_link;
  const emailed = link && isEmailConfigured() ? await sendPartnerInvite({ to: email, link, partnerName: partner.name }).catch(() => false) : false;
  return { inviteLink: emailed ? undefined : link };
}

// Admin invites a rep → PARTNER_MEMBER user + their own attribution code.
export async function invitePartnerMember(partnerId: string, email: string, name: string): Promise<{ ok: boolean; inviteLink?: string; error?: string }> {
  if (!isAdminConfigured()) return { ok: false, error: "Auth isn't configured yet" };
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { name: true } });
  if (!partner) return { ok: false, error: "Partner not found" };
  const lower = email.trim().toLowerCase();
  const admin = getAdminClient();
  const redirectTo = `${appUrl()}/auth/confirm?next=/partner`;
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email: lower, options: { redirectTo } });
  if (error || !data?.user) return { ok: false, error: error?.message ?? "Could not invite" };
  const [firstName, ...rest] = name.trim().split(/\s+/);
  await prisma.user.upsert({
    where: { id: data.user.id },
    update: { partnerId, role: "PARTNER_MEMBER", status: "INVITED", firstName: firstName || null, lastName: rest.join(" ") || null },
    create: { id: data.user.id, email: lower, firstName: firstName || null, lastName: rest.join(" ") || null, role: "PARTNER_MEMBER", status: "INVITED", partnerId },
  });
  await prisma.membership.upsert({
    where: { userId_role_scopeId: { userId: data.user.id, role: "PARTNER_MEMBER", scopeId: partnerId } },
    update: {}, create: { userId: data.user.id, role: "PARTNER_MEMBER", scopeType: "PARTNER", scopeId: partnerId },
  });
  await prisma.partnerCode.create({ data: { code: await uniqueCode(name || partner.name), partnerId, memberUserId: data.user.id } });

  const link = data.properties?.action_link;
  const emailed = link && isEmailConfigured() ? await sendPartnerInvite({ to: lower, link, partnerName: partner.name, isRep: true }).catch(() => false) : false;
  return { ok: true, inviteLink: emailed ? undefined : link ?? undefined };
}

// Resolve the partner context for a logged-in partner user.
export async function getViewerPartner(user: { id: string; partnerId: string | null; activeRole?: string; role: string }) {
  if (!user.partnerId) return null;
  const isAdmin = (user.activeRole ?? user.role) === "PARTNER_ADMIN";
  return { partnerId: user.partnerId, isAdmin, memberUserId: isAdmin ? null : user.id };
}

const sum = (rows: { commissionCents: number }[]) => rows.reduce((a, r) => a + r.commissionCents, 0);

// Dashboard data, scoped to the org (admin) or a single rep (member).
export async function getPartnerDashboard(partnerId: string, memberUserId: string | null) {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, include: { codes: true } });
  if (!partner) return null;

  // Which referral codes (and thus accounts) are in scope.
  const scopedCodes = memberUserId ? partner.codes.filter((c) => c.memberUserId === memberUserId) : partner.codes;
  const myCode = (memberUserId ? scopedCodes[0]?.code : partner.codes.find((c) => !c.memberUserId)?.code ?? partner.codes[0]?.code) ?? null;

  // Offices referred to this partner, optionally narrowed to the rep's codes.
  const codeStrings = scopedCodes.map((c) => c.code);
  const offices = await prisma.office.findMany({
    where: memberUserId
      ? { referredByPartnerId: partnerId, referralCode: { in: codeStrings.length ? codeStrings : ["__none__"] } }
      : { referredByPartnerId: partnerId },
    select: { id: true, name: true, isProspect: true, subscription: { select: { status: true } } },
  });
  const officeIds = offices.map((o) => o.id);

  const commissions = officeIds.length
    ? await prisma.partnerCommission.findMany({ where: { partnerId, officeId: { in: officeIds } }, select: { officeId: true, commissionCents: true, status: true } })
    : [];
  const byStatus = (s: string) => sum(commissions.filter((c) => c.status === s));
  const earnedByOffice = (id: string) => sum(commissions.filter((c) => c.officeId === id && (c.status === "EARNED" || c.status === "PAID")));

  const isDistribution = partner.track === "DISTRIBUTION";
  const accounts = await Promise.all(
    offices.map(async (o) => {
      const status = o.isProspect ? "prospect" : o.subscription?.status === "ACTIVE" ? "active" : "lapsed";
      let balanceMin: number | undefined;
      if (isDistribution && !o.isProspect) balanceMin = (await getMinuteBalance(o.id)).remainingMin;
      return { id: o.id, name: o.name, status, earnedCents: earnedByOffice(o.id), balanceMin, low: balanceMin != null && balanceMin < 120 };
    })
  );

  const hasPractice = Boolean(await prisma.user.findFirst({ where: { partnerId, officeId: { not: null } }, select: { id: true } }));

  const members = memberUserId
    ? []
    : await (async () => {
        const reps = await prisma.user.findMany({ where: { partnerId, role: "PARTNER_MEMBER" }, select: { id: true, firstName: true, lastName: true, email: true, status: true } });
        return reps.map((r) => ({ id: r.id, name: fullName(r.firstName, r.lastName), email: r.email, status: r.status, code: partner.codes.find((c) => c.memberUserId === r.id)?.code ?? null }));
      })();

  return {
    partner: { name: partner.name, track: partner.track, status: partner.status, payoutMethod: partner.payoutMethod, hasPractice },
    isAdmin: !memberUserId,
    isDistribution,
    code: myCode,
    link: myCode ? refLink(myCode) : null,
    earnings: { pendingCents: byStatus("PENDING"), earnedCents: byStatus("EARNED"), paidCents: byStatus("PAID") },
    accounts: accounts.sort((a, b) => b.earnedCents - a.earnedCents),
    members,
  };
}
