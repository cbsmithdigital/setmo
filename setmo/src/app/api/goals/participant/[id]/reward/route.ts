import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { decideReward } from "@/lib/goals";

export const maxDuration = 60;

const Body = z.object({ action: z.enum(["approve", "marksent", "decline"]) });

// POST /api/goals/participant/[id]/reward — approve & send / mark sent / decline.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  const part = await prisma.goalParticipant.findUnique({ where: { id }, select: { goal: { select: { officeId: true, organizationId: true } } } });
  if (!part) return error("Not found", 404);
  const role = getActiveRole(user);
  const g = part.goal;
  const canManage =
    role === "PLATFORM_ADMIN" ||
    (role === "OFFICE_ADMIN" && g.officeId === user.officeId) ||
    (role === "GROUP_ADMIN" && g.organizationId === user.organizationId);
  if (!canManage) return error("Forbidden", 403);

  const res = await decideReward(id, parsed.data.action, user.id);
  if (!res.ok) return error(res.error ?? "Could not process reward", 409);
  return json(res);
}
