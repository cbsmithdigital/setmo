import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { activateGoal } from "@/lib/goals";

export const maxDuration = 60;

const Body = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(1000).optional().nullable(),
  targetType: z.enum(["SETTER", "TEAM"]),
  officeId: z.string().optional().nullable(), // required for TEAM goals (which practice)
  setterIds: z.array(z.string()).optional().default([]), // for SETTER goals
  metric: z.enum(["OVERALL_SCORE", "SKILL_SCORE", "SET_RATE", "SHOW_RATE", "CONSULTS", "CASES", "PRODUCTION", "REPS", "PRACTICE_HOURS", "STREAK_WEEKS", "LEADERBOARD_RANK", "PERSONAL_BEST", "MANUAL"]),
  skillKey: z.string().optional().nullable(),
  comparator: z.enum(["REACH", "IMPROVE_BY", "MAINTAIN", "RANK_TOP"]).default("REACH"),
  targetValue: z.number(),
  window: z.enum(["THIS_MONTH", "LAST_30D", "CUSTOM", "ONGOING"]).default("THIS_MONTH"),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  recurrence: z.enum(["NONE", "MONTHLY"]).default("NONE"),
  minQualifyingReps: z.number().int().min(0).max(100).default(5),
  rewardType: z.enum(["GIFT_CARD", "CUSTOM"]).default("GIFT_CARD"),
  rewardAmountCents: z.number().int().min(0).optional().nullable(),
  rewardLabel: z.string().max(160).optional().nullable(),
  includeManager: z.boolean().default(false),
});

// POST /api/goals — create + activate a goal (office admin or group admin).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const role = getActiveRole(user);
  if (!isManagerRole(role)) return error("Forbidden", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const b = parsed.data;

  if (b.rewardType === "GIFT_CARD" && !b.rewardAmountCents) return error("Gift-card reward needs an amount", 422);
  if (b.rewardType === "CUSTOM" && !b.rewardLabel) return error("Custom reward needs a label", 422);
  if (b.metric === "SKILL_SCORE" && !b.skillKey) return error("Skill goal needs a skill", 422);

  const isGroup = role === "GROUP_ADMIN";
  const creatorScope = isGroup ? "GROUP" : "OFFICE";
  const organizationId = isGroup ? user.organizationId : null;
  if (isGroup && !organizationId) return error("No organization on your account", 400);

  // Resolve the practice context + validate ownership.
  let officeId: string | null = null;
  if (b.targetType === "TEAM") {
    officeId = isGroup ? b.officeId ?? null : user.officeId;
    if (!officeId) return error("Team goal needs a practice", 422);
    if (isGroup) {
      const office = await prisma.office.findUnique({ where: { id: officeId }, select: { organizationId: true } });
      if (office?.organizationId !== organizationId) return error("That practice isn't in your group", 403);
    } else if (officeId !== user.officeId) {
      return error("Forbidden", 403);
    }
  }

  // Validate setter targets belong to the creator's scope.
  let validSetterIds: string[] = [];
  if (b.targetType === "SETTER") {
    if (b.setterIds.length === 0) return error("Pick at least one setter", 422);
    const where = isGroup
      ? { id: { in: b.setterIds }, role: "SETTER" as const, office: { organizationId } }
      : { id: { in: b.setterIds }, role: "SETTER" as const, officeId: user.officeId };
    const setters = await prisma.user.findMany({ where, select: { id: true } });
    validSetterIds = setters.map((s) => s.id);
    if (validSetterIds.length === 0) return error("No valid setters in your scope", 403);
  }

  const goal = await prisma.goal.create({
    data: {
      creatorScope,
      officeId,
      organizationId,
      createdById: user.id,
      title: b.title,
      description: b.description ?? null,
      targetType: b.targetType,
      metric: b.metric,
      skillKey: b.skillKey ?? null,
      comparator: b.comparator,
      targetValue: b.targetValue,
      window: b.window,
      startDate: b.window === "CUSTOM" && b.startDate ? new Date(b.startDate) : null,
      endDate: b.window === "CUSTOM" && b.endDate ? new Date(b.endDate + "T23:59:59") : null,
      recurrence: b.recurrence,
      minQualifyingReps: b.minQualifyingReps,
      rewardType: b.rewardType,
      rewardAmountCents: b.rewardAmountCents ?? null,
      rewardLabel: b.rewardLabel ?? null,
      funderScope: creatorScope,
      includeManager: b.includeManager,
      status: "DRAFT",
    },
  });

  await activateGoal(goal.id, validSetterIds);
  return json({ ok: true, id: goal.id });
}
