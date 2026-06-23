import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { inviteUsers } from "@/lib/invites";
import { error, json } from "@/lib/api";

const Body = z.object({
  emails: z.array(z.string().email()).min(1).max(25),
  role: z.enum(["GROUP_ADMIN", "OFFICE_ADMIN", "SETTER"]),
  officeId: z.string().optional(), // required for office-scoped roles
});

// POST /api/group/invites — a group admin invites a group admin (org-wide), or
// an office admin / setter into a specific location in the group.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!["GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role)) return error("Only group admins can invite here", 403);
  if (!user.organizationId) return error("No group assigned", 400);
  if (!isAdminConfigured()) return error("Auth isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid invite", 422);
  const { emails, role, officeId } = parsed.data;

  let targetOfficeId: string | null = null;
  let contextName: string;

  if (role === "GROUP_ADMIN") {
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } });
    contextName = org?.name ?? "your group";
  } else {
    if (!officeId) return error("Choose a location for this role", 422);
    const office = await prisma.office.findFirst({ where: { id: officeId, organizationId: user.organizationId }, select: { id: true, name: true } });
    if (!office) return error("That location isn't in your group", 422);
    targetOfficeId = office.id;
    contextName = office.name;
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await inviteUsers({
    emails,
    role,
    officeId: targetOfficeId,
    organizationId: user.organizationId,
    inviterId: user.id,
    inviterName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Your group admin",
    contextName,
    origin,
  });
  return json(result);
}
