import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { resendInvite } from "@/lib/invites";
import { error, json } from "@/lib/api";

const Body = z.object({ userId: z.string() });

// POST /api/office/invites/resend — re-send the invite link to a still-invited
// user in the admin's office.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role)) return error("Only admins can resend invites", 403);
  if (!user.officeId) return error("No office assigned", 400);
  if (!isAdminConfigured()) return error("Auth isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { email: true, status: true, officeId: true } });
  if (!target || target.officeId !== user.officeId) return error("User not found in your office", 404);
  if (target.status !== "INVITED") return error("That user has already joined", 409);
  if (!target.email) return error("That user has no email on file", 422);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await resendInvite({
    email: target.email,
    contextName: user.office?.name ?? "your practice",
    inviterName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Your office admin",
    origin,
  });
  if (!result.ok) return error("Couldn't resend the invite", 502);
  return json({ ok: true, previewLink: result.previewLink });
}
