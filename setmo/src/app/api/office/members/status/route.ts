import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";

const Body = z.object({ userId: z.string(), status: z.enum(["ACTIVE", "DISABLED"]) });

// POST /api/office/members/status — enable or disable a member in the admin's
// office. Can't change your own status.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role)) return error("Only admins can change member status", 403);
  if (!user.officeId) return error("No office assigned", 400);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { userId, status } = parsed.data;
  if (userId === user.id) return error("You can't change your own status", 400);

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { officeId: true } });
  if (!target || target.officeId !== user.officeId) return error("User not found in your office", 404);

  await prisma.user.update({ where: { id: userId }, data: { status } });
  return json({ ok: true });
}
