import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { isEmailConfigured, sendPartnerInvite } from "@/lib/email";
import { confirmLink } from "@/lib/invites";
import { getMinuteBalance } from "@/lib/usage";
import { fullName } from "@/lib/format";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://setmo.growdental.ai";

/** A partner's tracking link. It lands on the home page; the proxy stores the code
 *  in a cookie, so the practice is credited whether they sign up, run a free audit,
 *  or come back later. */
export const partnerLink = (code: string) => `${appUrl()}/?ref=${encodeURIComponent(code)}`;

function genCode(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10) || "rep";
  return `${slug}-${randomBytes(3).toString("hex")}`;
}
async function uniqueCode(name: string): Promise<string> {
  let code = genCode(name);
  while (await prisma.partnerCode.findUnique({ where: { code } })) code = genCode(name);
  return code;
}

/** A setup link that works with the server-side confirm route (token_hash), and
 *  lands on /invite where the password is set and the account turns ACTIVE. The
 *  raw Supabase action_link uses a browser-only flow that route can't read. */
async function partnerSetupLink(email: string): Promise<{ userId: string; link: string | null } | { error: string }> {
  const admin = getAdminClient();
  const redirectTo = `${appUrl()}/auth/confirm?next=/invite`;
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
  if (error || !data?.user) return { error: error?.message ?? "Could not create a login" };
  return { userId: data.user.id, link: confirmLink(appUrl(), data.properties?.hashed_token, "invite", "/invite") };
}

// ---------------------------------------------------------------------------
// Demo access: the partner's demo organization, so partner users can learn the
// product and show it to prospects with realistic data. Everyone on the partner
// team gets the same hats in it — setter, office admin and group admin — and the
// role switcher moves between them and the partner dashboard.
// ---------------------------------------------------------------------------

async function demoTargets(partnerId: string): Promise<{ orgId: string; officeId: string; officeIds: string[] } | null> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { demoOrganizationId: true } });
  if (!partner?.demoOrganizationId) return null;
  const offices = await prisma.office.findMany({
    where: { organizationId: partner.demoOrganizationId, isDemo: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return offices.length ? { orgId: partner.demoOrganizationId, officeId: offices[0].id, officeIds: offices.map((o) => o.id) } : null;
}

const PLATFORM_OR_CALL_CENTER = new Set(["PLATFORM_ADMIN", "SUPPORT", "CALL_CENTER_ADMIN", "CALL_CENTER_MANAGER"]);

/**
 * Put a partner user into the partner's demo org with its three hats. Only for
 * logins that belong to nothing real: anyone already in a real practice, group
 * or call center — or SetMo staff — is left exactly where they are (demo access
 * would overwrite their office / org, and the hats would apply to it).
 */
export async function grantDemoAccess(userId: string, partnerId: string): Promise<boolean> {
  const t = await demoTargets(partnerId);
  if (!t) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, officeId: true, organizationId: true, callCenterPodId: true, memberships: { select: { role: true } } },
  });
  if (!user) return false;
  if (PLATFORM_OR_CALL_CENTER.has(user.role) || user.memberships.some((m) => PLATFORM_OR_CALL_CENTER.has(m.role))) return false;
  if (user.callCenterPodId) return false;
  if (user.officeId && !t.officeIds.includes(user.officeId)) return false;
  if (user.organizationId && user.organizationId !== t.orgId) return false;
  await prisma.user.update({
    where: { id: userId },
    // No weekly digest about a demo practice.
    data: { officeId: t.officeId, organizationId: t.orgId, digestOptOut: true },
  });
  const hats: { role: "SETTER" | "OFFICE_ADMIN" | "GROUP_ADMIN"; scopeType: "OFFICE" | "GROUP"; scopeId: string }[] = [
    { role: "SETTER", scopeType: "OFFICE", scopeId: t.officeId },
    { role: "OFFICE_ADMIN", scopeType: "OFFICE", scopeId: t.officeId },
    { role: "GROUP_ADMIN", scopeType: "GROUP", scopeId: t.orgId },
  ];
  for (const h of hats) {
    await prisma.membership.upsert({
      where: { userId_role_scopeId: { userId, role: h.role, scopeId: h.scopeId } },
      update: { scopeType: h.scopeType },
      create: { userId, role: h.role, scopeType: h.scopeType, scopeId: h.scopeId },
    });
  }
  return true;
}

export async function revokeDemoAccess(userId: string, partnerId: string): Promise<void> {
  const t = await demoTargets(partnerId);
  if (!t) return;
  await prisma.membership.deleteMany({ where: { userId, scopeId: { in: [...t.officeIds, t.orgId] } } });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { officeId: true, organizationId: true } });
  const inDemoOffice = Boolean(user?.officeId && t.officeIds.includes(user.officeId));
  if (user && (inDemoOffice || user.organizationId === t.orgId)) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(inDemoOffice ? { officeId: null } : {}),
        ...(user.organizationId === t.orgId ? { organizationId: null } : {}),
      },
    });
  }
}

type LoginShape = {
  role: string;
  officeId: string | null;
  organizationId: string | null;
  memberships: { role: string; scopeId: string | null }[];
};

/** A login whose ONLY purpose is a seat on this partner's team (plus its demo
 *  hats) — nothing else in SetMo depends on it, so the partner may manage it. */
async function isPartnerOnlyLogin(u: LoginShape, partnerId: string): Promise<boolean> {
  if (u.role !== "PARTNER_MEMBER") return false;
  const t = await demoTargets(partnerId);
  const demoScopes = new Set(t ? [...t.officeIds, t.orgId] : []);
  if (u.officeId && !demoScopes.has(u.officeId)) return false;
  if (u.organizationId && !demoScopes.has(u.organizationId)) return false;
  return u.memberships.every(
    (m) => (m.role === "PARTNER_MEMBER" && m.scopeId === partnerId) || (["SETTER", "OFFICE_ADMIN", "GROUP_ADMIN"].includes(m.role) && m.scopeId != null && demoScopes.has(m.scopeId))
  );
}

const LOGIN_SELECT = {
  id: true,
  partnerId: true,
  status: true,
  firstName: true,
  role: true,
  officeId: true,
  organizationId: true,
  memberships: { select: { role: true, scopeId: true } },
} as const;

// On approval: link/create the Partner Admin login from the partner's contact.
// Returns a setup link when it wasn't emailed (so the admin can hand it over).
export async function ensurePartnerAdminUser(partnerId: string, opts: { sendEmail?: boolean } = {}): Promise<{ inviteLink?: string; userId?: string }> {
  const sendEmail = opts.sendEmail ?? true;
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner?.email) return {};
  const email = partner.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Never pull someone off another partner's team.
    if (existing.partnerId && existing.partnerId !== partnerId) return {};
    // Dual identity — keep their login, add the partner role + link. (Only SetMo
    // staff get here, approving a partner; demo access skips anyone who already
    // belongs to a real practice or group.)
    await prisma.user.update({ where: { id: existing.id }, data: { partnerId } });
    await prisma.membership.upsert({
      where: { userId_role_scopeId: { userId: existing.id, role: "PARTNER_ADMIN", scopeId: partnerId } },
      update: {},
      create: { userId: existing.id, role: "PARTNER_ADMIN", scopeType: "PARTNER", scopeId: partnerId },
    });
    await grantDemoAccess(existing.id, partnerId);
    return { userId: existing.id };
  }
  if (!isAdminConfigured()) return {};

  const minted = await partnerSetupLink(email);
  if ("error" in minted) return {};
  const [firstName, ...rest] = (partner.contactName ?? "").trim().split(/\s+/);
  await prisma.user.create({
    data: { id: minted.userId, email, firstName: firstName || null, lastName: rest.join(" ") || null, role: "PARTNER_ADMIN", status: "INVITED", partnerId },
  });
  await prisma.membership.create({ data: { userId: minted.userId, role: "PARTNER_ADMIN", scopeType: "PARTNER", scopeId: partnerId } });
  await grantDemoAccess(minted.userId, partnerId);

  const link = minted.link;
  const emailed =
    sendEmail && link && isEmailConfigured()
      ? await sendPartnerInvite({ to: email, link, partnerName: partner.name, trackingOnly: !partner.commissionsEnabled }).catch(() => false)
      : false;
  return { inviteLink: emailed ? undefined : link ?? undefined, userId: minted.userId };
}

// Admin invites a rep → a PARTNER_MEMBER login, their own tracking code, and
// demo access. Safe to re-run for the same person (no duplicate codes), and
// re-adding a removed rep restores them. A partner admin can only ever create or
// restore a rep-only login: an email that already has any other SetMo login (a
// practice, a group, SetMo staff) is refused — SetMo adds those people by hand.
export async function invitePartnerMember(partnerId: string, email: string, name: string): Promise<{ ok: boolean; inviteLink?: string; error?: string }> {
  if (!isAdminConfigured()) return { ok: false, error: "Auth isn't configured yet" };
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { name: true, commissionsEnabled: true } });
  if (!partner) return { ok: false, error: "Partner not found" };
  const lower = email.trim().toLowerCase();
  const [firstName, ...rest] = name.trim().split(/\s+/);

  const existing = await prisma.user.findUnique({ where: { email: lower }, select: LOGIN_SELECT });
  if (existing?.partnerId && existing.partnerId !== partnerId) {
    return { ok: false, error: "That person is already on another partner's team." };
  }
  if (existing && (existing.role === "PARTNER_ADMIN" || existing.memberships.some((m) => m.role === "PARTNER_ADMIN"))) {
    return { ok: false, error: "That's a partner admin login already." };
  }
  if (existing && !(await isPartnerOnlyLogin(existing, partnerId))) {
    return { ok: false, error: "That email already has a SetMo login, so it can't be added from here. Ask SetMo to add them to your team." };
  }

  let userId: string;
  let link: string | null = null;
  if (existing) {
    userId = existing.id;
    let status = existing.status;
    // Not signed up yet, or being re-added after removal: a fresh setup link. If
    // they'd already set a password, Supabase won't mint an invite — re-activating
    // is enough then (they sign in as before).
    if (existing.status === "INVITED" || existing.status === "DISABLED") {
      const minted = await partnerSetupLink(lower);
      if (!("error" in minted)) {
        link = minted.link;
        status = "INVITED";
      } else if (existing.status === "DISABLED") {
        status = "ACTIVE";
      }
    }
    await prisma.user.update({
      where: { id: userId },
      data: { partnerId, status, ...(existing.firstName ? {} : { firstName: firstName || null, lastName: rest.join(" ") || null }) },
    });
  } else {
    const minted = await partnerSetupLink(lower);
    if ("error" in minted) return { ok: false, error: minted.error };
    userId = minted.userId;
    link = minted.link;
    await prisma.user.create({
      data: { id: userId, email: lower, firstName: firstName || null, lastName: rest.join(" ") || null, role: "PARTNER_MEMBER", status: "INVITED", partnerId },
    });
  }

  await prisma.membership.upsert({
    where: { userId_role_scopeId: { userId, role: "PARTNER_MEMBER", scopeId: partnerId } },
    update: {},
    create: { userId, role: "PARTNER_MEMBER", scopeType: "PARTNER", scopeId: partnerId },
  });
  if (!(await prisma.partnerCode.findFirst({ where: { partnerId, memberUserId: userId }, select: { id: true } }))) {
    await prisma.partnerCode.create({ data: { code: await uniqueCode(name || partner.name), partnerId, memberUserId: userId } });
  }
  await grantDemoAccess(userId, partnerId);

  const emailed =
    link && isEmailConfigured()
      ? await sendPartnerInvite({ to: lower, link, partnerName: partner.name, isRep: true, trackingOnly: !partner.commissionsEnabled }).catch(() => false)
      : false;
  return { ok: true, inviteLink: emailed ? undefined : link ?? undefined };
}

/** Re-send the partner setup email (partner wording, lands on /invite). */
export async function resendPartnerInvite(userId: string): Promise<{ ok: boolean; previewLink?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, partnerId: true, memberships: { select: { role: true } }, partner: { select: { name: true, commissionsEnabled: true } } },
  });
  if (!user?.partnerId || !user.partner) return { ok: false };
  const minted = await partnerSetupLink(user.email);
  if ("error" in minted || !minted.link) return { ok: false };
  const isRep = !user.memberships.some((m) => m.role === "PARTNER_ADMIN");
  const sent = isEmailConfigured()
    ? await sendPartnerInvite({ to: user.email, link: minted.link, partnerName: user.partner.name, isRep, trackingOnly: !user.partner.commissionsEnabled }).catch(() => false)
    : false;
  return { ok: true, previewLink: sent ? undefined : minted.link };
}

/** Remove a rep: they lose the rep seat and their demo hats. Their tracking code
 *  keeps resolving to the partner, so practices already holding their link are
 *  still credited, and their past referrals stay on the partner's dashboard.
 *  Only a rep-only login is switched off; anyone with a SetMo login of their own
 *  (set up by SetMo) keeps it and just loses the rep seat. */
export async function disablePartnerMember(partnerId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const rep = await prisma.user.findFirst({
    where: { id: userId, partnerId, memberships: { some: { role: "PARTNER_MEMBER", scopeId: partnerId } } },
    select: LOGIN_SELECT,
  });
  if (!rep) return { ok: false, error: "Rep not found" };
  if (rep.role === "PARTNER_ADMIN" || rep.memberships.some((m) => m.role === "PARTNER_ADMIN")) {
    return { ok: false, error: "A partner admin can't be removed here — contact SetMo." };
  }
  const repOnly = await isPartnerOnlyLogin(rep, partnerId);
  await revokeDemoAccess(userId, partnerId);
  if (repOnly) {
    // Kept on the team list as removed; adding the same email again restores them.
    await prisma.user.update({ where: { id: userId }, data: { status: "DISABLED" } });
  } else {
    await prisma.membership.deleteMany({ where: { userId, role: "PARTNER_MEMBER", scopeId: partnerId } });
    await prisma.user.update({ where: { id: userId }, data: { partnerId: null } });
  }
  return { ok: true };
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

  // The rep behind each code, so the admin sees who brought in which practice.
  const repIds = [...new Set(partner.codes.map((c) => c.memberUserId).filter((x): x is string => Boolean(x)))];
  const reps = repIds.length
    ? await prisma.user.findMany({ where: { id: { in: repIds } }, select: { id: true, firstName: true, lastName: true, email: true, status: true } })
    : [];
  const repById = new Map(reps.map((r) => [r.id, r]));
  const repForCode = (code: string | null) => {
    const repId = partner.codes.find((c) => c.code === code)?.memberUserId;
    const r = repId ? repById.get(repId) : null;
    return r ? { id: r.id, name: fullName(r.firstName, r.lastName) || r.email } : null;
  };

  // Offices referred to this partner, optionally narrowed to the rep's codes.
  // Office referred directly OR via its group/DSO (so every location under a
  // referred group shows up for the partner). Demo / test accounts never count.
  const codeStrings = scopedCodes.map((c) => c.code);
  const inCodes = { in: codeStrings.length ? codeStrings : ["__none__"] };
  const offices = await prisma.office.findMany({
    where: {
      isDemo: false,
      ...(memberUserId
        ? { OR: [{ referredByPartnerId: partnerId, referralCode: inCodes }, { organization: { referredByPartnerId: partnerId, referralCode: inCodes } }] }
        : { OR: [{ referredByPartnerId: partnerId }, { organization: { referredByPartnerId: partnerId } }] }),
    },
    select: {
      id: true,
      name: true,
      isProspect: true,
      referralCode: true,
      referredAt: true,
      createdAt: true,
      subscription: { select: { status: true } },
      organization: { select: { referralCode: true } },
    },
  });
  const officeIds = offices.map((o) => o.id);

  const commissions = officeIds.length && partner.commissionsEnabled
    ? await prisma.partnerCommission.findMany({ where: { partnerId, officeId: { in: officeIds } }, select: { officeId: true, commissionCents: true, status: true } })
    : [];
  const byStatus = (s: string) => sum(commissions.filter((c) => c.status === s));
  const earnedByOffice = (id: string) => sum(commissions.filter((c) => c.officeId === id && (c.status === "EARNED" || c.status === "PAID")));

  const isDistribution = partner.track === "DISTRIBUTION";
  const accounts = await Promise.all(
    offices.map(async (o) => {
      const status = o.isProspect ? "prospect" : o.subscription?.status === "ACTIVE" ? "active" : "signed_up";
      let balanceMin: number | undefined;
      if (isDistribution && !o.isProspect) balanceMin = (await getMinuteBalance(o.id)).remainingMin;
      const rep = repForCode(o.referralCode ?? o.organization?.referralCode ?? null);
      return {
        id: o.id,
        name: o.name,
        status,
        rep: rep?.name ?? null,
        repId: rep?.id ?? null,
        referredAt: o.referredAt ?? o.createdAt,
        earnedCents: earnedByOffice(o.id),
        balanceMin,
        low: balanceMin != null && balanceMin < 120,
      };
    })
  );

  const counts = {
    referred: accounts.length,
    assessing: accounts.filter((a) => a.status === "prospect").length,
    signedUp: accounts.filter((a) => a.status === "signed_up").length,
    active: accounts.filter((a) => a.status === "active").length,
  };

  // Credit payouts can only land in a real practice the partner admin runs — the
  // same rule the payout run applies.
  const hasPractice = Boolean(
    await prisma.user.findFirst({
      where: { partnerId, officeId: { not: null }, office: { isDemo: false }, OR: [{ role: "PARTNER_ADMIN" }, { memberships: { some: { role: "PARTNER_ADMIN" } } }] },
      select: { id: true },
    })
  );

  // Reps are found by their rep membership, not their primary role — a rep who
  // also runs a practice keeps that as their primary role.
  const members = memberUserId
    ? []
    : await (async () => {
        const repUsers = await prisma.user.findMany({
          where: { partnerId, memberships: { some: { role: "PARTNER_MEMBER", scopeId: partnerId } } },
          select: { id: true, firstName: true, lastName: true, email: true, status: true },
          orderBy: { createdAt: "asc" },
        });
        return repUsers.map((r) => {
          const mine = accounts.filter((a) => a.repId === r.id);
          const code = partner.codes.find((c) => c.memberUserId === r.id)?.code ?? null;
          return {
            id: r.id,
            name: fullName(r.firstName, r.lastName),
            email: r.email,
            status: r.status,
            code,
            link: code ? partnerLink(code) : null,
            referred: mine.length,
            active: mine.filter((a) => a.status === "active").length,
          };
        });
      })();

  return {
    partner: {
      name: partner.name,
      track: partner.track,
      status: partner.status,
      payoutMethod: partner.payoutMethod,
      hasPractice,
      connectOnboarded: partner.connectOnboarded,
      commissionsEnabled: partner.commissionsEnabled,
      hasDemo: Boolean(partner.demoOrganizationId),
    },
    isAdmin: !memberUserId,
    isDistribution,
    code: myCode,
    link: myCode ? partnerLink(myCode) : null,
    counts,
    earnings: { pendingCents: byStatus("PENDING"), earnedCents: byStatus("EARNED"), paidCents: byStatus("PAID") },
    accounts: accounts.sort((a, b) => b.earnedCents - a.earnedCents || +new Date(b.referredAt) - +new Date(a.referredAt)),
    members,
  };
}
