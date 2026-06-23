import { prisma } from "@/lib/db";
import { getAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendInviteEmail } from "@/lib/email";

export type InviteRole = "SETTER" | "OFFICE_ADMIN" | "GROUP_ADMIN";

/**
 * Mint a Supabase invite link per address, create/refresh an INVITED user row
 * with the chosen role + scope, and email the link via Resend. Shared by the
 * office and group invite routes.
 */
export async function inviteUsers(opts: {
  emails: string[];
  role: InviteRole;
  officeId: string | null;
  organizationId: string | null;
  inviterId: string;
  inviterName: string;
  contextName: string; // office or group name shown in the email
  origin: string;
}): Promise<{ invited: number; failed: string[]; previewLinks: string[] }> {
  const admin = getAdminClient();
  const redirectTo = `${opts.origin}/auth/confirm?next=/invite`;

  let invited = 0;
  const previewLinks: string[] = [];
  const failed: string[] = [];

  for (const email of opts.emails) {
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
      update: { officeId: opts.officeId, organizationId: opts.organizationId, role: opts.role, status: "INVITED", invitedById: opts.inviterId },
      create: {
        id: data.user.id,
        email,
        role: opts.role,
        status: "INVITED",
        officeId: opts.officeId,
        organizationId: opts.organizationId,
        invitedById: opts.inviterId,
      },
    });

    const link = data.properties?.action_link;
    if (link) {
      const sent = isEmailConfigured()
        ? await sendInviteEmail({ to: email, link, officeName: opts.contextName, inviterName: opts.inviterName }).catch(() => false)
        : false;
      if (!sent) previewLinks.push(link);
    }
    invited++;
  }

  return { invited, failed, previewLinks };
}
