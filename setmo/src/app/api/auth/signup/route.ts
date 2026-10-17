import { z } from "zod";
import { cookies } from "next/headers";
import { REF_COOKIE } from "@/lib/referral-cookie";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { provisionAccount } from "@/lib/provision";
import { error, json } from "@/lib/api";
import { clientIp, withinLimits, tooMany, HOUR, DAY } from "@/lib/rate-limit";
import { isBot, BOT_MESSAGE } from "@/lib/bot-check";

const Body = z.object({
  kind: z.enum(["practice", "group"]),
  contactName: z.string().min(1).max(120),
  practiceName: z.string().min(1).max(160),
  orgName: z.string().max(160).optional().nullable(),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  ref: z.string().max(60).optional().nullable(),
  agree: z.literal(true), // agreed to the Terms of Service and Privacy Policy
});

// POST /api/auth/signup — self-serve account creation. Free signup; the practice
// activates Practice Access + buys minutes from the billing page afterward.
export async function POST(req: Request) {
  if (!isAdminConfigured()) return error("Signup isn't configured yet", 503);
  if (await isBot()) return error(BOT_MESSAGE, 403);
  const ip = clientIp(req);
  const limit = await withinLimits([
    { key: `signup:ip:${ip}`, limit: 5, windowSeconds: HOUR },
    { key: `signup:ip-day:${ip}`, limit: 20, windowSeconds: DAY },
  ]);
  if (!limit.ok) return tooMany(limit.retryAfter);
  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const agreed = Boolean(raw && typeof raw === "object" && (raw as { agree?: unknown }).agree === true);
    return error(agreed ? "Check the form and try again." : "Please agree to the Terms of Service and Privacy Policy to continue.", 422);
  }
  const b = parsed.data;

  // The link's code if the form carried one, else the first-touch cookie from an
  // earlier visit (e.g. they landed on the home page via a partner link).
  const cookieRef = (await cookies()).get(REF_COOKIE)?.value ?? null;
  const res = await provisionAccount({
    kind: b.kind,
    practiceName: b.practiceName,
    orgName: b.orgName ?? undefined,
    contactName: b.contactName,
    email: b.email,
    password: b.password,
    referralCode: b.ref ?? undefined,
    cookieReferralCode: cookieRef,
    termsAcceptedAt: new Date(),
  });
  if (!res.ok) return error(res.error, res.code);
  return json({ ok: true });
}
