import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { inviteUsers } from "@/lib/invites";
import { error, json } from "@/lib/api";

const Body = z.object({
  emails: z.array(z.string().email()).min(1).max(25),
  roles: z.array(z.enum(["GROUP_ADMIN", "OFFICE_ADMIN", "SETTER"])).min(1),
  officeId: z.string().optional(), // required when any office-scoped role is selected
});

// POST /api/group/invites — a group admin invites with one or more roles: group
// admin (org-wide) and/or office admin / setter at a chosen location.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!["GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role)) return error("Only group admins can invite here", 403);
  if (!user.organizationId) return error("No group assigned", 400);
  if (!isAdminConfigured()) return error("Auth isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid invite", 422);
  const { emails, roles, officeId } = parsed.data;
  const needsOffice = roles.some((r) => r === "OFFICE_ADMIN" || r === "SETTER");

  let targetOfficeId: string | null = null;
  let contextName: string;

  if (needsOffice) {
    if (!officeId) return error("Choose a location for the office roles", 422);
    const office = await prisma.office.findFirst({ where: { id: officeId, organizationId: user.organizationId }, select: { id: true, name: true } });
    if (!office) return error("That location isn't in your group", 422);
    targetOfficeId = office.id;
    contextName = office.name;
  } else {
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } });
    contextName = org?.name ?? "your group";
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await inviteUsers({
    emails,
    roles,
    officeId: targetOfficeId,
    organizationId: user.organizationId,
    inviterId: user.id,
    inviterName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Your group admin",
    contextName,
    origin,
  });
  return json(result);
}
