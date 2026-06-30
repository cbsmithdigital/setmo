import { prisma } from "@/lib/db";
import { getAdminClient } from "@/lib/supabase/admin";
import { partnerIdForCode } from "@/lib/partners";

// Self-serve account provisioning, shared by the direct signup and the
// assessment→account conversion. Creates the Supabase auth user (auto-confirmed,
// with a password) + the Office (or Organization + first Office for a group) +
// the admin User + role Membership. No subscription — access is activated after,
// from the billing page (free signup, activate to run calls).

export type ProvisionResult = { ok: true; userId: string } | { ok: false; error: string; code: number };

export async function provisionAccount(opts: {
  kind: "practice" | "group";
  practiceName: string; // first location name
  orgName?: string; // group name (group only; defaults to practiceName)
  contactName: string;
  email: string;
  password: string;
  claimOfficeId?: string; // convert an existing prospect office (from an assessment)
  referralCode?: string | null; // first-touch partner attribution (direct signup)
}): Promise<ProvisionResult> {
  const email = opts.email.trim().toLowerCase();
  // Resolve a partner code → attribution for newly-created offices (first-touch).
  const refPartnerId = opts.referralCode ? await partnerIdForCode(opts.referralCode) : null;
  const refData = refPartnerId ? { referredByPartnerId: refPartnerId, referralCode: opts.referralCode!.trim().toLowerCase() } : {};

  // A real (non-prospect) account already on this email?
  const existing = await prisma.user.findUnique({ where: { email }, select: { status: true } });
  if (existing && existing.status === "ACTIVE") {
    return { ok: false, error: "An account with this email already exists — sign in instead.", code: 409 };
  }

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password: opts.password, email_confirm: true });
  if (error || !data?.user) {
    const msg = error?.message ?? "";
    const dupe = /already|registered|exists/i.test(msg);
    return { ok: false, error: dupe ? "An account with this email already exists — sign in instead." : msg || "Could not create your account.", code: dupe ? 409 : 502 };
  }
  const userId = data.user.id;
  const [firstName, ...rest] = opts.contactName.trim().split(/\s+/);
  const lastName = rest.join(" ") || null;

  try {
    if (opts.kind === "practice") {
      const office = opts.claimOfficeId
        ? await prisma.office.update({ where: { id: opts.claimOfficeId }, data: { isProspect: false, name: opts.practiceName } })
        : await prisma.office.create({ data: { name: opts.practiceName, isProspect: false, ...refData } });
      await prisma.user.create({ data: { id: userId, email, firstName, lastName, role: "OFFICE_ADMIN", status: "ACTIVE", officeId: office.id } });
      await prisma.membership.create({ data: { userId, role: "OFFICE_ADMIN", scopeType: "OFFICE", scopeId: office.id } });
    } else {
      // Org carries the partner referral too, so EVERY office under the group
      // (this one + any added later) earns commission for the referring partner.
      const org = await prisma.organization.create({ data: { name: opts.orgName?.trim() || opts.practiceName, type: "GROUP", ...refData } });
      const office = opts.claimOfficeId
        ? await prisma.office.update({ where: { id: opts.claimOfficeId }, data: { isProspect: false, name: opts.practiceName, organizationId: org.id } })
        : await prisma.office.create({ data: { name: opts.practiceName, isProspect: false, organizationId: org.id, ...refData } });
      // Group admin who also manages the first location (multi-role).
      await prisma.user.create({ data: { id: userId, email, firstName, lastName, role: "GROUP_ADMIN", status: "ACTIVE", organizationId: org.id, officeId: office.id } });
      await prisma.membership.create({ data: { userId, role: "GROUP_ADMIN", scopeType: "GROUP", scopeId: org.id } });
      await prisma.membership.create({ data: { userId, role: "OFFICE_ADMIN", scopeType: "OFFICE", scopeId: office.id } });
    }
    return { ok: true, userId };
  } catch (e) {
    // Roll back the auth user so a half-provisioned email can retry cleanly.
    try { await admin.auth.admin.deleteUser(userId); } catch { /* ignore */ }
    return { ok: false, error: e instanceof Error ? e.message : "Could not set up your account.", code: 500 };
  }
}
