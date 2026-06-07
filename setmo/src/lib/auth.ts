import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Role } from "@/generated/prisma/client";

export type SessionUser = Awaited<ReturnType<typeof loadCurrentUser>>;

// Resolves the Supabase-authenticated identity to our application User row,
// including the tenant context (office + organization) used for RBAC scoping.
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
    },
  });
  if (!user) return null;

  return { ...user, email: user.email ?? authUser.email ?? "" };
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

/** Requires the user to hold one of the given roles. */
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
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
