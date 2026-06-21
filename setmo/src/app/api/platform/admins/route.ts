import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor, isPlatformRole } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/platform";
import { error, json } from "@/lib/api";

const Body = z.object({
  action: z.enum(["add", "role", "revoke"]),
  email: z.string().email().optional(),
  userId: z.string().optional(),
  role: z.enum(["PLATFORM_ADMIN", "SUPPORT"]).optional(),
  password: z.string().min(8).max(200).optional(),
});

// POST /api/platform/admins — manage internal staff (Super-Admin only).
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor || actor.role !== "PLATFORM_ADMIN") return error("Super-admin only", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { action, email, userId, role, password } = parsed.data;

  if (action === "add") {
    if (!email || !role) return error("Email and role required", 422);
    const lower = email.trim().toLowerCase();
    const admin = getAdminClient();
    // Find existing auth user; create with a password if not found.
    let authId: string | null = null;
    for (let page = 1; page <= 10 && !authId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const u = data.users.find((x) => x.email?.toLowerCase() === lower);
      if (u) authId = u.id;
      if (data.users.length < 200) break;
    }
    if (!authId) {
      if (!password) return error("That email has no account yet — set a temporary password to create one.", 422);
      const { data, error: e } = await admin.auth.admin.createUser({ email: lower, password, email_confirm: true });
      if (e || !data?.user) return error(e?.message ?? "Could not create user", 502);
      authId = data.user.id;
    }
    await prisma.user.upsert({
      where: { id: authId },
      update: { role, status: "ACTIVE", officeId: null, organizationId: null },
      create: { id: authId, email: lower, role, status: "ACTIVE" },
    });
    await prisma.membership.upsert({
      where: { userId_role_scopeId: { userId: authId, role, scopeId: "platform" } },
      update: {},
      create: { userId: authId, role, scopeType: "PLATFORM", scopeId: "platform" },
    });
    await logAdminAction(actor, { action: "admin.add", summary: `Added ${lower} as ${role}`, targetType: "user", targetId: authId });
    return json({ ok: true });
  }

  // role / revoke require a target user that is internal staff
  if (!userId) return error("User required", 422);
  if (userId === actor.id) return error("You can't change your own admin access here", 400);
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
  if (!target || !isPlatformRole(target.role)) return error("Not an internal admin", 404);

  if (action === "role") {
    if (!role) return error("Role required", 422);
    await prisma.user.update({ where: { id: userId }, data: { role } });
    await prisma.membership.deleteMany({ where: { userId, scopeType: "PLATFORM" } });
    await prisma.membership.create({ data: { userId, role, scopeType: "PLATFORM", scopeId: "platform" } });
    await logAdminAction(actor, { action: "admin.role", summary: `Changed ${target.email} to ${role}`, targetType: "user", targetId: userId });
  } else {
    // revoke — remove app access (auth user remains, but no User row)
    await prisma.membership.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await logAdminAction(actor, { action: "admin.revoke", summary: `Revoked admin access for ${target.email}`, targetType: "user", targetId: userId });
  }
  return json({ ok: true });
}
