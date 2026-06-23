import { prisma } from "@/lib/db";
import { getAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendInviteEmail } from "@/lib/email";

export type InviteRole = "SETTER" | "OFFICE_ADMIN" | "GROUP_ADMIN";

// Highest-privilege selected role becomes the User's primary role (active by
// default); the rest are added as memberships so the user can switch between them.
const PRIORITY: InviteRole[] = ["GROUP_ADMIN", "OFFICE_ADMIN", "SETTER"];

function scopeFor(role: InviteRole, officeId: string | null, organizationId: string | null): { scopeType: "OFFICE" | "GROUP"; scopeId: string | null } {
  return role === "GROUP_ADMIN" ? { scopeType: "GROUP", scopeId: organizationId } : { scopeType: "OFFICE", scopeId: officeId };
}

/**
 * Mint a Supabase invite link per address, create/refresh an INVITED user with
 * the chosen role(s) — primary role on the user row plus a membership per role
 * so a person can be e.g. office admin AND setter — then email the link.
 * Shared by the office and group invite routes.
 */
export async function inviteUsers(opts: {
  emails: string[];
  roles: InviteRole[];
  officeId: string | null;
  organizationId: string | null;
  inviterId: string;
  inviterName: string;
  contextName: string; // office or group name shown in the email
  origin: string;
}): Promise<{ invited: number; failed: string[]; previewLinks: string[] }> {
  const admin = getAdminClient();
  const redirectTo = `${opts.origin}/auth/confirm?next=/invite`;
  const roles = Array.from(new Set(opts.roles));
  const primary = PRIORITY.find((r) => roles.includes(r)) ?? "SETTER";

  let invited = 0;
  const previewLinks: string[] = [];
  const failed: string[] = [];

  for (const email of opts.emails) {
    const { data, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });
    if (linkErr || !data?.user) {
      failed.push(email);
      continue;
    }
    const userId = data.user.id;

    await prisma.user.upsert({
      where: { id: userId },
      update: { officeId: opts.officeId, organizationId: opts.organizationId, role: primary, status: "INVITED", invitedById: opts.inviterId },
      create: {
        id: userId,
        email,
        role: primary,
        status: "INVITED",
        officeId: opts.officeId,
        organizationId: opts.organizationId,
        invitedById: opts.inviterId,
      },
    });

    // One membership per selected role (scoped to office or group as appropriate).
    for (const role of roles) {
      const { scopeType, scopeId } = scopeFor(role, opts.officeId, opts.organizationId);
      if (!scopeId) continue; // can't scope (e.g. group admin without an org) — skip defensively
      await prisma.membership.upsert({
        where: { userId_role_scopeId: { userId, role, scopeId } },
        update: { scopeType },
        create: { userId, role, scopeType, scopeId },
      });
    }

    const link = data.properties?.action_link;
    if (link) {
      const sent = isEmailConfigured()
        ? await sendInviteEmail({ to: email, link, officeName: opts.contextName, inviterName: opts.inviterName }).catch(() => false)
        : false;
      if (!sent) previewLinks.push(link);
    }
    invited++;
  }

  return { invited, failed, previewLinks };
}
