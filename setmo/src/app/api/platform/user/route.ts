import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor, isPlatformRole } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { fullName } from "@/lib/format";
import { error, json } from "@/lib/api";

const Body = z.object({
  userId: z.string().min(1),
  action: z.enum(["deactivate", "reactivate", "role"]),
  role: z.enum(["SETTER", "OFFICE_ADMIN", "GROUP_ADMIN"]).optional(),
});

// POST /api/platform/user — deactivate/reactivate or change a customer user's role.
// Platform-staff targets are protected (managing admins is a Super-Admin/P3 concern).
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { userId, action, role } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true, role: true } });
  if (!target) return error("User not found", 404);
  if (isPlatformRole(target.role)) return error("Can't modify internal staff here", 403);
  const name = fullName(target.firstName, target.lastName) || target.email;

  if (action === "role") {
    if (!role) return error("Role required", 422);
    await prisma.user.update({ where: { id: userId }, data: { role } });
    await logAdminAction(actor, { action: "user.role", summary: `Changed ${name}'s role to ${role}`, targetType: "user", targetId: userId, detail: { from: target.role, to: role } });
  } else {
    const status = action === "deactivate" ? "DISABLED" : "ACTIVE";
    await prisma.user.update({ where: { id: userId }, data: { status } });
    await logAdminAction(actor, { action: `user.${action}`, summary: `${action === "deactivate" ? "Deactivated" : "Reactivated"} ${name}`, targetType: "user", targetId: userId });
  }
  return json({ ok: true });
}
