import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { resendInvite } from "@/lib/invites";
import { json } from "@/lib/api";

const Body = z.object({ email: z.string().email() });

// POST /api/auth/request-setup — an invited user (re)sends themselves their
// account-setup link. Always returns ok (never reveals account existence).
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: true });

  if (isAdminConfigured()) {
    try {
      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email.trim().toLowerCase() },
        select: { status: true, email: true, office: { select: { name: true } } },
      });
      if (user && user.status === "INVITED" && user.email) {
        const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
        await resendInvite({ email: user.email, contextName: user.office?.name ?? "your practice", inviterName: "Your SetMo team", origin });
      }
    } catch {
      /* swallow — never reveal account existence */
    }
  }
  return json({ ok: true });
}
