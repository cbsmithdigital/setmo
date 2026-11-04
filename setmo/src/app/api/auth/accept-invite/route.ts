import { z } from "zod";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { LEGAL_EFFECTIVE } from "@/lib/legal";
import { error, json } from "@/lib/api";

const Body = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  agree: z.boolean().optional(), // the Terms, for an account owner (see below)
});

// POST /api/auth/accept-invite — finalize an invited account: the password is
// set via the Supabase client; this records the name and flips status to ACTIVE.
// The owner of an account the SetMo team set up (lib/staff-accounts) never saw
// sign-up's Terms checkbox, so they agree here; it's kept on the login with the
// version they saw, the same way sign-up records it.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return error("Unauthorized", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Name is required", 422);

  // A disabled (removed) account must not be able to turn itself back on with a
  // still-valid session or an old setup link.
  const current = await prisma.user.findUnique({ where: { id: authUser.id }, select: { status: true } });
  if (!current) return error("Account not found", 404);
  if (current.status === "DISABLED") return error("This account has been disabled.", 403);

  const meta = (authUser.app_metadata ?? {}) as Record<string, unknown>;
  if (meta.terms_required && !meta.terms_accepted_at) {
    if (parsed.data.agree !== true) return error("Please agree to the Terms of Service and Privacy Policy to continue.", 422);
    const { error: metaErr } = await getAdminClient().auth.admin.updateUserById(authUser.id, {
      app_metadata: { ...meta, terms_accepted_at: new Date().toISOString(), terms_version: LEGAL_EFFECTIVE },
    });
    if (metaErr) return error("Couldn't save your agreement to the Terms — try again.", 502);
  }

  await prisma.user.update({
    where: { id: authUser.id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      status: "ACTIVE",
    },
  });

  return json({ ok: true });
}
