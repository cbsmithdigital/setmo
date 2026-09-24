import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Role } from "@/generated/prisma/client";

export type SessionUser = Awaited<ReturnType<typeof loadCurrentUser>>;

export const ACTIVE_ROLE_COOKIE = "setmo_active_role";
export const IMPERSONATE_COOKIE = "setmo_impersonate";

function loadUserRecord(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      office: { include: { subscription: true, services: true } },
      organization: true,
      partner: true,
      memberships: true,
    },
  });
}

// Resolves the Supabase-authenticated identity to our application User row,
// including the tenant context (office + organization) used for RBAC scoping
// and the roles the user holds (for multi-role switching). If a platform admin
// is impersonating ("view as"), the impersonated user is returned instead, with
// `impersonatedBy` set so the UI can show a banner.
async function loadCurrentUser() {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const realUser = await loadUserRecord(authUser.id);
  if (!realUser) return null;

  // Impersonation: only honored when the real user is internal platform staff.
  let user = realUser;
  let impersonatedBy: { id: string; email: string } | null = null;
  if (isPlatformRole(realUser.role)) {
    try {
      const impId = (await cookies()).get(IMPERSONATE_COOKIE)?.value;
      if (impId && impId !== realUser.id) {
        const target = await loadUserRecord(impId);
        if (target) {
          user = target;
          impersonatedBy = { id: realUser.id, email: realUser.email ?? authUser.email ?? "" };
        }
      }
    } catch {
      /* cookies() unavailable — ignore */
    }
  }

  // Roles the user can act as — their primary role plus any extra memberships that
  // belong to the practice / group they're in NOW. Permission checks key on the
  // active role plus user.officeId / organizationId, so a hat left over from
  // another office (a partner's demo, a previous practice) must never turn into
  // admin rights over the current one.
  const roles = Array.from(new Set<Role>([user.role, ...user.memberships.filter((m) => membershipInScope(m, user)).map((m) => m.role)]));

  // Active role from a cookie (validated against held roles); while impersonating,
  // always show the impersonated user's own default role.
  let activeRole: Role = user.role;
  if (!impersonatedBy) {
    try {
      const picked = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value as Role | undefined;
      if (picked && roles.includes(picked)) activeRole = picked;
    } catch {
      /* cookies() unavailable in some contexts — fall back to primary role */
    }
  }

  return { ...user, email: user.email ?? (impersonatedBy ? user.email : authUser.email) ?? "", roles, activeRole, impersonatedBy };
}

/** An office hat (setter / office admin) counts only in the office it was given
 *  for, a group-admin hat only in its group. Other roles (multi-practice admin,
 *  partner, platform) carry their own scoping. */
function membershipInScope(
  m: { role: Role; scopeType: string; scopeId: string | null },
  user: { officeId: string | null; organizationId: string | null }
): boolean {
  if (!m.scopeId) return true;
  if (m.role === "SETTER" || m.role === "OFFICE_ADMIN") return m.scopeType !== "OFFICE" || m.scopeId === user.officeId;
  if (m.role === "GROUP_ADMIN") return m.scopeType !== "GROUP" || m.scopeId === user.organizationId;
  return true;
}

/** The real internal-staff actor (ignores impersonation). Null if not platform. */
export async function getPlatformActor() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;
  const u = await prisma.user.findUnique({ where: { id: authUser.id }, select: { id: true, email: true, role: true } });
  if (!u || !isPlatformRole(u.role)) return null;
  return u;
}

/** Returns the current user or null. Never throws on missing config. A disabled
 *  account is treated as signed out for API calls too (pages already redirect via
 *  requireUser) — otherwise a removed user's still-valid session could keep
 *  starting calls. Platform staff viewing-as a disabled user still see them. */
export async function getCurrentUser() {
  try {
    const user = await loadCurrentUser();
    if (user && user.status === "DISABLED" && !user.impersonatedBy) return null;
    return user;
  } catch {
    return null;
  }
}

/** Requires an authenticated, active user; redirects to /login otherwise. */
export async function requireUser() {
  // Load directly (not via getCurrentUser, which hides disabled accounts) so a
  // disabled user gets the "account disabled" login message, not a bare login.
  const user = await loadCurrentUser().catch(() => null);
  if (!user) redirect("/login");
  // Disabled accounts lose app access (can't re-enable themselves).
  if (user.status === "DISABLED" && !user.impersonatedBy) redirect("/login?disabled=1");
  return user;
}

/** Requires the user to be acting as one of the given roles. */
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(getActiveRole(user))) redirect("/go");
  return user;
}

/**
 * The role the user is currently acting as. SINGLE SWITCH POINT for multi-role —
 * resolved in loadCurrentUser() from the active-role cookie (validated against
 * held roles), defaulting to the primary role.
 */
export function getActiveRole(user: { role: Role; activeRole?: Role }): Role {
  return user.activeRole ?? user.role;
}

/** True when the active role manages a team/practice (vs. an individual setter). */
export function isManagerRole(role: Role): boolean {
  return role === "OFFICE_ADMIN" || role === "GROUP_ADMIN" || role === "PLATFORM_ADMIN";
}

/** Internal team roles (the platform/support console). */
export function isPlatformRole(role: Role): boolean {
  return role === "PLATFORM_ADMIN" || role === "SUPPORT";
}
/** Call-center roles: senior (admin) + floor/pod manager. Their agents are setters. */
export function isCallCenterRole(role: Role): boolean {
  return role === "CALL_CENTER_ADMIN" || role === "CALL_CENTER_MANAGER";
}
/** Super Admin — config + managing admins + destructive actions. */
export function isSuperAdmin(role: Role): boolean {
  return role === "PLATFORM_ADMIN";
}
/** Partner-portal roles. */
export function isPartnerRole(role: Role): boolean {
  return role === "PARTNER_ADMIN" || role === "PARTNER_MEMBER" || role === "DISTRIBUTOR" || role === "CONSULTANT";
}

/** The default landing route for a role. */
export function homeForRole(role: Role): string {
  switch (role) {
    case "PLATFORM_ADMIN":
    case "SUPPORT":
      return "/platform";
    case "DISTRIBUTOR":
    case "CONSULTANT":
    case "PARTNER_ADMIN":
    case "PARTNER_MEMBER":
      return "/partner";
    case "CALL_CENTER_ADMIN":
    case "CALL_CENTER_MANAGER":
      return "/callcenter";
    case "GROUP_ADMIN":
    case "MULTI_PRACTICE_ADMIN":
      return "/group";
    case "OFFICE_ADMIN":
      return "/office";
    case "SETTER":
    default:
      return "/dashboard";
  }
}
