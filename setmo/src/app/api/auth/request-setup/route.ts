import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { resendInvite } from "@/lib/invites";
import { error, json } from "@/lib/api";
import { clientIp, withinLimits, tooMany, HOUR } from "@/lib/rate-limit";
import { isBot, BOT_MESSAGE } from "@/lib/bot-check";

const Body = z.object({ email: z.string().email() });

// POST /api/auth/request-setup — an invited user (re)sends themselves their
// account-setup link. Always returns ok (never reveals account existence).
export async function POST(req: Request) {
  if (await isBot()) return error(BOT_MESSAGE, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: true });

  const limit = await withinLimits([
    { key: `setup:ip:${clientIp(req)}`, limit: 10, windowSeconds: HOUR },
    { key: `setup:email:${parsed.data.email.trim().toLowerCase()}`, limit: 3, windowSeconds: HOUR },
  ]);
  if (!limit.ok) return tooMany(limit.retryAfter, "We've sent a few of these already — check your inbox (and spam), or try again in a little while.");

  if (isAdminConfigured()) {
    try {
      // Older invites kept the address as typed, so match regardless of case.
      const user = await prisma.user.findFirst({
        where: { email: { equals: parsed.data.email.trim(), mode: "insensitive" } },
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
