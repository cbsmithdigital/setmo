import { prisma } from "@/lib/db";
import { getAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendInviteEmail } from "@/lib/email";

export type InviteRole = "SETTER" | "OFFICE_ADMIN" | "GROUP_ADMIN";
export type Invitee = { email: string; firstName?: string; lastName?: string };

// Build a link to our own /auth/confirm carrying the token_hash. This is the
// SSR-safe pattern: the server verifies it directly (sets the session cookie),
// unlike the raw Supabase action_link which uses the implicit/hash flow that a
// server route can't read.
function confirmLink(origin: string, hashedToken: string | undefined, next: string): string | null {
  return hashedToken ? `${origin}/auth/confirm?token_hash=${hashedToken}&type=invite&next=${encodeURIComponent(next)}` : null;
}

// Highest-privilege selected role becomes the User's primary role (active by
// default); the rest are added as memberships so the user can switch between them.
const PRIORITY: InviteRole[] = ["GROUP_ADMIN", "OFFICE_ADMIN", "SETTER"];

/** Split a free-text full name into first / last for storage. */
export function splitName(name?: string): { firstName?: string; lastName?: string } {
  const t = (name ?? "").trim();
  if (!t) return {};
  const [first, ...rest] = t.split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") || undefined };
}

function scopeFor(role: InviteRole, officeId: string | null, organizationId: string | null): { scopeType: "OFFICE" | "GROUP"; scopeId: string | null } {
  return role === "GROUP_ADMIN" ? { scopeType: "GROUP", scopeId: organizationId } : { scopeType: "OFFICE", scopeId: officeId };
}

/**
 * Mint a Supabase invite link per invitee, create/refresh an INVITED user with
 * the chosen role(s) and name — primary role on the user row plus a membership
 * per role so a person can be e.g. office admin AND setter — then email the link.
 * Shared by the office and group invite routes.
 */
export async function inviteUsers(opts: {
  invitees: Invitee[];
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

  for (const invitee of opts.invitees) {
    const { data, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email: invitee.email,
      options: { redirectTo },
    });
    if (linkErr || !data?.user) {
      failed.push(invitee.email);
      continue;
    }
    const userId = data.user.id;
    // Only write a name when one was provided, so re-invites never wipe an existing name.
    const nameData = invitee.firstName ? { firstName: invitee.firstName, lastName: invitee.lastName ?? null } : {};

    await prisma.user.upsert({
      where: { id: userId },
      update: { ...nameData, officeId: opts.officeId, organizationId: opts.organizationId, role: primary, status: "INVITED", invitedById: opts.inviterId },
      create: {
        id: userId,
        email: invitee.email,
        ...nameData,
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

    const link = confirmLink(opts.origin, data.properties?.hashed_token, "/invite");
    if (link) {
      const sent = isEmailConfigured()
        ? await sendInviteEmail({ to: invitee.email, link, officeName: opts.contextName, inviterName: opts.inviterName }).catch(() => false)
        : false;
      if (!sent) previewLinks.push(link);
    }
    invited++;
  }

  return { invited, failed, previewLinks };
}

/** Re-mint and re-send an invite link for an existing invited user. */
export async function resendInvite(opts: { email: string; contextName: string; inviterName: string; origin: string }): Promise<{ ok: boolean; previewLink?: string }> {
  const admin = getAdminClient();
  const redirectTo = `${opts.origin}/auth/confirm?next=/invite`;
  const { data, error: linkErr } = await admin.auth.admin.generateLink({ type: "invite", email: opts.email, options: { redirectTo } });
  const link = confirmLink(opts.origin, data?.properties?.hashed_token, "/invite");
  if (linkErr || !link) return { ok: false };
  const sent = isEmailConfigured()
    ? await sendInviteEmail({ to: opts.email, link, officeName: opts.contextName, inviterName: opts.inviterName }).catch(() => false)
    : false;
  return { ok: true, previewLink: sent ? undefined : link };
}
