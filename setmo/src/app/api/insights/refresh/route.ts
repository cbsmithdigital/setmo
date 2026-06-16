import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { getInsight, type InsightScope } from "@/lib/insights";

export const maxDuration = 60;

const Body = z.object({
  scope: z.enum(["SETTER", "OFFICE", "GROUP"]),
  subjectId: z.string().min(1),
});

// Can this user (re)generate the insight for this subject?
async function canAccess(user: { id: string; officeId: string | null; organizationId: string | null }, role: string, scope: InsightScope, subjectId: string): Promise<boolean> {
  if (role === "PLATFORM_ADMIN") return true;
  if (scope === "GROUP") return user.organizationId === subjectId;
  if (scope === "OFFICE") {
    if (user.officeId === subjectId) return true;
    if (role === "GROUP_ADMIN" && user.organizationId) {
      const office = await prisma.office.findUnique({ where: { id: subjectId }, select: { organizationId: true } });
      return office?.organizationId === user.organizationId;
    }
    return false;
  }
  // SETTER
  if (subjectId === user.id) return true;
  const setter = await prisma.user.findUnique({ where: { id: subjectId }, select: { officeId: true, organizationId: true } });
  if (!setter) return false;
  if ((role === "OFFICE_ADMIN" || role === "GROUP_ADMIN") && user.officeId && setter.officeId === user.officeId) return true;
  if (role === "GROUP_ADMIN" && user.organizationId && setter.organizationId === user.organizationId) return true;
  return false;
}

// POST /api/insights/refresh — force-regenerate Setty's cached "next move".
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { scope, subjectId } = parsed.data;

  const role = getActiveRole(user);
  if (!(await canAccess(user, role, scope, subjectId))) return error("Forbidden", 403);

  const insight = await getInsight(scope, subjectId, { force: true });
  if (!insight) return error("Not enough data yet", 409);
  return json({ ok: true, insight: { headline: insight.headline, body: insight.body, generatedAt: insight.generatedAt } });
}
