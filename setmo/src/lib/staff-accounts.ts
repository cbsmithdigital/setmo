import { prisma } from "@/lib/db";
import { getAdminClient } from "@/lib/supabase/admin";
import { seedOfficeServices } from "@/lib/office-services";
import { confirmLink, splitName } from "@/lib/invites";
import { grantTrialHour, newTrialEnd } from "@/lib/trials";

// ===========================================================================
// Accounts SetMo staff set up for a practice or group (Platform → Accounts →
// New account). The same records sign-up makes — the office (or group plus its
// first location), every call type on, the owner as office or group admin — but
// the owner gets an invite instead of choosing a password here: they set it,
// agree to the Terms (their login is marked terms_required), and add a card
// later from Billing. With a trial, access is on for 14 days with a
// complimentary hour of practice calls (lib/trials).
// ===========================================================================

export type NewAccountInput = {
  kind: "practice" | "group";
  practiceName: string; // the practice, or the group's first location
  city?: string | null;
  orgName?: string | null; // group only
  ownerName: string;
  ownerEmail: string;
  partnerId?: string | null; // referral credit
  trial: boolean;
  createdById: string;
  origin: string;
};

export type NewAccountResult =
  | { ok: true; accountId: string; officeId: string; emailed: boolean; link: string | null; trialEndsAt: Date | null }
  | { ok: false; error: string; status: number };

export async function createAccountForOwner(input: NewAccountInput): Promise<NewAccountResult> {
  const email = input.ownerEmail.trim().toLowerCase();
  const practiceName = input.practiceName.trim();
  const orgName = input.kind === "group" ? input.orgName?.trim() || practiceName : null;
  const { firstName, lastName } = splitName(input.ownerName);
  const { isUndeliverable } = await import("@/lib/email");
  if (isUndeliverable(email)) return { ok: false, status: 422, error: "Use the owner's real email address." };

  // One SetMo login per email: anyone already on SetMo has to be moved by hand.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, status: 409, error: "That email already has a SetMo login. Use the owner's other email, or ask for that login to be moved." };

  // Referral credit: the partner's main tracking code, as if they'd signed up through it.
  let refData: { referredByPartnerId: string; referralCode: string | null; referredAt: Date } | null = null;
  if (input.partnerId) {
    const partner = await prisma.partner.findUnique({ where: { id: input.partnerId }, select: { id: true, status: true, codes: { select: { code: true, memberUserId: true } } } });
    if (!partner || partner.status !== "APPROVED") return { ok: false, status: 422, error: "That partner isn't approved, so it can't be credited." };
    const code = (partner.codes.find((c) => !c.memberUserId) ?? partner.codes[0])?.code ?? null;
    refData = { referredByPartnerId: partner.id, referralCode: code, referredAt: new Date() };
  }

  // 1) The owner's login and setup link, first — if this fails nothing is made.
  // A login left over with no SetMo account (someone removed earlier) can't take
  // an invite, so it gets a one-time sign-in link to the same setup page.
  const admin = getAdminClient();
  const redirectTo = `${input.origin}/auth/confirm?next=/invite`;
  let linkType: "invite" | "magiclink" = "invite";
  let gen = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
  if (gen.error && /already|registered|exists/i.test(gen.error.message)) {
    linkType = "magiclink";
    gen = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
  }
  if (gen.error || !gen.data?.user) return { ok: false, status: 502, error: gen.error?.message ?? "Couldn't create the owner's login." };
  const authUser = gen.data.user;
  const userId = authUser.id;
  // The owner agrees to the Terms when they set up (the invite page asks; accept-invite records it).
  await admin.auth.admin.updateUserById(userId, { app_metadata: { ...(authUser.app_metadata ?? {}), setmo_owner: true, terms_required: true } });

  // 2) The account.
  const trialEndsAt = input.trial ? newTrialEnd() : null;
  let made: { orgId: string | null; officeId: string };
  try {
    made = await prisma.$transaction(async (tx) => {
      let orgId: string | null = null;
      if (input.kind === "group") {
        const org = await tx.organization.create({ data: { name: orgName!, type: "GROUP", ...(refData ?? {}), trialEndsAt } });
        orgId = org.id;
      }
      const office = await tx.office.create({
        data: {
          name: practiceName,
          city: input.city?.trim() || null,
          isProspect: false,
          organizationId: orgId,
          ...(refData ?? {}),
          // A group's trial is the group's (it covers locations added later too).
          ...(orgId ? {} : { trialEndsAt }),
        },
      });
      const role = input.kind === "group" ? "GROUP_ADMIN" : "OFFICE_ADMIN";
      await tx.user.create({
        data: { id: userId, email, firstName: firstName ?? null, lastName: lastName ?? null, role, status: "INVITED", officeId: office.id, organizationId: orgId, invitedById: input.createdById },
      });
      if (orgId) await tx.membership.create({ data: { userId, role: "GROUP_ADMIN", scopeType: "GROUP", scopeId: orgId } });
      await tx.membership.create({ data: { userId, role: "OFFICE_ADMIN", scopeType: "OFFICE", scopeId: office.id } });
      return { orgId, officeId: office.id };
    });
  } catch (e) {
    // Undo the login this made, so the email can be tried again cleanly.
    if (linkType === "invite" && !authUser.last_sign_in_at) await admin.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Couldn't set up the account." };
  }
  await seedOfficeServices(made.officeId);
  if (input.trial) await grantTrialHour(made.officeId);

  // 3) The owner's email (or the link, for staff to send by hand).
  const link = confirmLink(input.origin, gen.data.properties?.hashed_token, linkType, "/invite");
  const { isEmailConfigured, sendAccountReadyEmail } = await import("@/lib/email");
  const emailed =
    link && isEmailConfigured()
      ? await sendAccountReadyEmail({ to: email, link, accountName: orgName ?? practiceName, firstName, trialEndsAt }).catch(() => false)
      : false;
  return { ok: true, accountId: made.orgId ?? made.officeId, officeId: made.officeId, emailed, link: emailed ? null : link, trialEndsAt };
}

/** Push a trial's end out by `days` from the later of now and its current end
 *  (a practice's own trial, or a group's), and re-arm the reminder emails. */
export async function extendTrial(accountId: string, days: number): Promise<{ ok: true; endsAt: Date; name: string } | { ok: false; error: string; status: number }> {
  const DAY = 86_400_000;
  const org = await prisma.organization.findUnique({ where: { id: accountId }, select: { id: true, name: true, trialEndsAt: true } });
  if (org) {
    if (!org.trialEndsAt) return { ok: false, status: 409, error: "This account doesn't have a trial." };
    const base = Math.max(Date.now(), org.trialEndsAt.getTime());
    const endsAt = new Date(base + days * DAY);
    await prisma.organization.update({ where: { id: org.id }, data: { trialEndsAt: endsAt, trialNoticeStage: 0 } });
    return { ok: true, endsAt, name: org.name };
  }
  const office = await prisma.office.findUnique({ where: { id: accountId }, select: { id: true, name: true, trialEndsAt: true } });
  if (!office) return { ok: false, status: 404, error: "Account not found" };
  if (!office.trialEndsAt) return { ok: false, status: 409, error: "This account doesn't have a trial." };
  const base = Math.max(Date.now(), office.trialEndsAt.getTime());
  const endsAt = new Date(base + days * DAY);
  await prisma.office.update({ where: { id: office.id }, data: { trialEndsAt: endsAt, trialNoticeStage: 0 } });
  return { ok: true, endsAt, name: office.name };
}
