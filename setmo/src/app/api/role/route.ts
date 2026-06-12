import { cookies } from "next/headers";
import { z } from "zod";
import { getCurrentUser, ACTIVE_ROLE_COOKIE, homeForRole } from "@/lib/auth";
import { error, json } from "@/lib/api";
import type { Role } from "@/generated/prisma/client";

const Body = z.object({
  role: z.enum(["PLATFORM_ADMIN", "DISTRIBUTOR", "CONSULTANT", "GROUP_ADMIN", "OFFICE_ADMIN", "SETTER"]),
});

// POST /api/role — switch the active role for a multi-role user. Validated
// against the roles they actually hold; persisted in a cookie.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const role = parsed.data.role as Role;

  if (!user.roles.includes(role)) return error("You don't hold that role", 403);

  (await cookies()).set(ACTIVE_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return json({ ok: true, role, home: homeForRole(role) });
}

// DELETE /api/role — clear the active-role choice (called on logout so it can't
// carry over to the next user on a shared browser).
export async function DELETE() {
  (await cookies()).delete(ACTIVE_ROLE_COOKIE);
  return json({ ok: true });
}
