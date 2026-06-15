import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Role } from "@/generated/prisma/client";

export type SessionUser = Awaited<ReturnType<typeof loadCurrentUser>>;

export const ACTIVE_ROLE_COOKIE = "setmo_active_role";

// Resolves the Supabase-authenticated identity to our application User row,
// including the tenant context (office + organization) used for RBAC scoping
// and the roles the user holds (for multi-role switching).
async function loadCurrentUser() {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    include: {
      office: {
        include: { subscription: true, services: true },
      },
      organization: true,
      partner: true,
      memberships: true,
    },
  });
  if (!user) return null;

  // Roles the user can act as — their primary role plus any extra memberships.
  const roles = Array.from(new Set<Role>([user.role, ...user.memberships.map((m) => m.role)]));

  // The active role comes from a cookie, validated against held roles; defaults
  // to the primary role. SINGLE place multi-role resolution happens.
  let activeRole: Role = user.role;
  try {
    const picked = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value as Role | undefined;
    if (picked && roles.includes(picked)) activeRole = picked;
  } catch {
    /* cookies() unavailable in some contexts — fall back to primary role */
  }

  return { ...user, email: user.email ?? authUser.email ?? "", roles, activeRole };
}

/** Returns the current user or null. Never throws on missing config. */
export async function getCurrentUser() {
  try {
    return await loadCurrentUser();
  } catch {
    return null;
  }
}

/** Requires an authenticated, active user; redirects to /login otherwise. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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

/** The default landing route for a role. */
export function homeForRole(role: Role): string {
  switch (role) {
    case "PLATFORM_ADMIN":
      return "/platform/practices";
    case "DISTRIBUTOR":
    case "CONSULTANT":
      return "/partner";
    case "GROUP_ADMIN":
      return "/group";
    case "OFFICE_ADMIN":
      return "/office";
    case "SETTER":
    default:
      return "/dashboard";
  }
}
