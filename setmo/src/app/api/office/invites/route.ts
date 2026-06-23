import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { inviteUsers } from "@/lib/invites";
import { error, json } from "@/lib/api";

const Body = z.object({
  emails: z.array(z.string().email()).min(1).max(25),
  roles: z.array(z.enum(["SETTER", "OFFICE_ADMIN", "GROUP_ADMIN"])).min(1),
});

// POST /api/office/invites — invite users to this office with one or more roles
// (setter, office admin, and group admin if the office is in a group). Mints a
// Supabase invite link per address and emails it via Resend.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role)) {
    return error("Only admins can invite users", 403);
  }
  if (!user.officeId) return error("No office assigned", 400);
  if (!isAdminConfigured()) return error("Auth isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid invite", 422);
  const { emails, roles } = parsed.data;

  // Granting group admin requires the office to be in a group AND the inviter to
  // hold group-admin authority (guards against office-admin privilege escalation).
  if (roles.includes("GROUP_ADMIN")) {
    if (!user.organizationId) return error("This practice isn't part of a group.", 422);
    if (!user.roles.some((r) => r === "GROUP_ADMIN" || r === "PLATFORM_ADMIN")) {
      return error("Only a group admin can grant group-admin access.", 403);
    }
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await inviteUsers({
    emails,
    roles,
    officeId: user.officeId,
    organizationId: user.organizationId,
    inviterId: user.id,
    inviterName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Your office admin",
    contextName: user.office?.name ?? "your practice",
    origin,
  });
  return json(result);
}
