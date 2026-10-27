import { z } from "zod";
import { isSeededDemoEmail } from "@/lib/demo-shared";
import { getAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { confirmLink } from "@/lib/invites";
import { sendPasswordResetEmail } from "@/lib/email";
import { error, json } from "@/lib/api";
import { clientIp, withinLimits, tooMany, HOUR } from "@/lib/rate-limit";
import { isBot, BOT_MESSAGE } from "@/lib/bot-check";

const Body = z.object({ email: z.string().email() });

// POST /api/auth/request-reset — send a password-reset link. Always returns ok
// (never reveals whether an account exists).
export async function POST(req: Request) {
  if (await isBot()) return error(BOT_MESSAGE, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: true }); // don't leak validity

  // Per visitor and per address, so this can't be used to flood someone's inbox.
  const limit = await withinLimits([
    { key: `reset:ip:${clientIp(req)}`, limit: 10, windowSeconds: HOUR },
    { key: `reset:email:${parsed.data.email.trim().toLowerCase()}`, limit: 3, windowSeconds: HOUR },
  ]);
  if (!limit.ok) return tooMany(limit.retryAfter, "We've sent a few of these already — check your inbox (and spam), or try again in a little while.");

  if (isAdminConfigured()) {
    try {
      // Seeded demo logins use made-up addresses, some on domains we don't own, so a
      // reset link for one would go to a stranger. Their passwords are managed by the team.
      if (isSeededDemoEmail(parsed.data.email)) return json({ ok: true });
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
