import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { isEmailConfigured, sendInviteEmail } from "@/lib/email";
import { error, json } from "@/lib/api";

const Body = z.object({ emails: z.array(z.string().email()).min(1).max(25) });

// POST /api/office/invites — invite setters by email. Mints a Supabase invite
// link per address, creates an INVITED user row, and emails the link via Resend.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role)) {
    return error("Only admins can invite setters", 403);
  }
  if (!user.officeId) return error("No office assigned", 400);
  if (!isAdminConfigured()) return error("Auth isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid email list", 422);

  const admin = getAdminClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const redirectTo = `${origin}/auth/confirm?next=/invite`;

  let invited = 0;
  const previewLinks: string[] = [];
  const failed: string[] = [];

  for (const email of parsed.data.emails) {
    const { data, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });

    if (linkErr || !data?.user) {
      failed.push(email);
      continue;
    }

    await prisma.user.upsert({
      where: { id: data.user.id },
      update: { officeId: user.officeId, organizationId: user.organizationId, role: "SETTER", status: "INVITED", invitedById: user.id },
      create: {
        id: data.user.id,
        email,
        role: "SETTER",
        status: "INVITED",
        officeId: user.officeId,
        organizationId: user.organizationId,
        invitedById: user.id,
      },
    });

    const link = data.properties?.action_link;
    if (link) {
      const sent = isEmailConfigured()
        ? await sendInviteEmail({
            to: email,
            link,
            officeName: user.office?.name ?? "your practice",
            inviterName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Your office admin",
          }).catch(() => false)
        : false;
      if (!sent) previewLinks.push(link);
    }
    invited++;
  }

  return json({ invited, failed, previewLinks });
}
