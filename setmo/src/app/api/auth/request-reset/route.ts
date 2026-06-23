import { z } from "zod";
import { getAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { confirmLink } from "@/lib/invites";
import { sendPasswordResetEmail } from "@/lib/email";
import { json } from "@/lib/api";

const Body = z.object({ email: z.string().email() });

// POST /api/auth/request-reset — send a password-reset link. Always returns ok
// (never reveals whether an account exists).
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: true }); // don't leak validity

  if (isAdminConfigured()) {
    try {
      const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      const admin = getAdminClient();
      const { data } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: parsed.data.email,
        options: { redirectTo: `${origin}/auth/confirm?next=/reset-password` },
      });
      const link = confirmLink(origin, data?.properties?.hashed_token, "recovery", "/reset-password");
      if (link) await sendPasswordResetEmail({ to: parsed.data.email, link });
    } catch {
      /* swallow — never reveal account existence or errors */
    }
  }
  return json({ ok: true });
}
