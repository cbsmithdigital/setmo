import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { inviteUsers } from "@/lib/invites";
import { error, json } from "@/lib/api";

const Body = z.object({
  emails: z.array(z.string().email()).min(1).max(25),
  role: z.enum(["SETTER", "OFFICE_ADMIN"]).default("SETTER"),
});

// POST /api/office/invites — invite users to this office as a setter or office
// admin. Mints a Supabase invite link per address and emails it via Resend.
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

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await inviteUsers({
    emails: parsed.data.emails,
    role: parsed.data.role,
    officeId: user.officeId,
    organizationId: user.organizationId,
    inviterId: user.id,
    inviterName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Your office admin",
    contextName: user.office?.name ?? "your practice",
    origin,
  });
  return json(result);
}
