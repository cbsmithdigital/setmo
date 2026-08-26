import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor, isPlatformRole } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { fullName } from "@/lib/format";
import { error, json } from "@/lib/api";

const Body = z.object({
  userId: z.string().min(1),
  action: z.enum(["deactivate", "reactivate", "role", "resend_invite"]),
  role: z.enum(["SETTER", "OFFICE_ADMIN", "GROUP_ADMIN"]).optional(),
});

// POST /api/platform/user — deactivate/reactivate, change role, or resend an
// invite email for a customer user. Runs in production (where the email keys
// live), so this is how a super-admin actually gets a branded invite delivered.
// Platform-staff targets are protected (managing admins is a Super-Admin/P3 concern).
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { userId, action, role } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true, role: true, status: true, office: { select: { name: true } }, organization: { select: { name: true } } },
  });
  if (!target) return error("User not found", 404);
  if (isPlatformRole(target.role)) return error("Can't modify internal staff here", 403);
  const name = fullName(target.firstName, target.lastName) || target.email;

  if (action === "resend_invite") {
    if (target.status !== "INVITED") return error("That user has already accepted their invite.", 409);
    const { resendInvite } = await import("@/lib/invites");
    const actorUser = await prisma.user.findUnique({ where: { id: actor.id }, select: { firstName: true, lastName: true } });
    const inviterName = fullName(actorUser?.firstName, actorUser?.lastName) || "the SetMo team";
    const contextName = target.office?.name ?? target.organization?.name ?? "SetMo";
    const origin = new URL(req.url).origin;
    const r = await resendInvite({ email: target.email, contextName, inviterName, origin });
    if (!r.ok) return error("Couldn't mint an invite link. Try again.", 502);
    await logAdminAction(actor, { action: "user.resend_invite", summary: `Re-sent invite to ${name}`, targetType: "user", targetId: userId, detail: { emailed: !r.previewLink } });
    return json({ ok: true, emailed: !r.previewLink, previewLink: r.previewLink ?? null });
  }

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
