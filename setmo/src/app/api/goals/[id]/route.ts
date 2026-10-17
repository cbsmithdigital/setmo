import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { evaluateGoal } from "@/lib/goals";

export const maxDuration = 60;

const Body = z.object({ action: z.enum(["archive", "evaluate"]) });

// PATCH /api/goals/[id] — archive a goal, or force a re-evaluation.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  const goal = await prisma.goal.findUnique({ where: { id }, select: { officeId: true, organizationId: true, office: { select: { organizationId: true } } } });
  if (!goal) return error("Not found", 404);
  const role = getActiveRole(user);
  // A group admin runs the group's own goals and any practice goal at one of its
  // locations (the office Goals page and its approval push reach them too).
  const canManage =
    role === "PLATFORM_ADMIN" ||
    (role === "OFFICE_ADMIN" && Boolean(user.officeId) && goal.officeId === user.officeId) ||
    (role === "GROUP_ADMIN" && Boolean(user.organizationId) && (goal.organizationId === user.organizationId || goal.office?.organizationId === user.organizationId));
  if (!canManage) return error("Forbidden", 403);

  if (parsed.data.action === "archive") {
    await prisma.goal.update({ where: { id }, data: { status: "ARCHIVED" } });
  } else {
    await evaluateGoal(id);
  }
  return json({ ok: true });
}
