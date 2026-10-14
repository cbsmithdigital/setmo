import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { inDemoAccount, DEMO_BILLING_MESSAGE } from "@/lib/demo-shared";

/** The signed-in group admin, if they may buy for this location (it's in their
 *  group, and the group isn't a demo). Otherwise the error to return. */
export async function groupBuyer(officeId: string): Promise<{ ok: true; email: string } | { ok: false; error: string; status: number }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Unauthorized", status: 401 };
  if (getActiveRole(user) !== "GROUP_ADMIN" || !user.organizationId) return { ok: false, error: "Only a group admin can buy for a location", status: 403 };
  if (inDemoAccount(user)) return { ok: false, error: DEMO_BILLING_MESSAGE, status: 403 };
  const office = await prisma.office.findFirst({ where: { id: officeId, organizationId: user.organizationId }, select: { id: true, isDemo: true } });
  if (!office) return { ok: false, error: "That location isn't in your group", status: 404 };
  if (office.isDemo) return { ok: false, error: DEMO_BILLING_MESSAGE, status: 403 };
  return { ok: true, email: user.email };
}
