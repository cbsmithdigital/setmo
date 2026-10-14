import { z } from "zod";
import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { startActivationCheckout } from "@/lib/checkout";
import { error, json } from "@/lib/api";
import { inDemoAccount, DEMO_BILLING_MESSAGE } from "@/lib/demo-shared";

// minutes: 0 = access-only activation (sign-up promo — the bonus tokens are the
// starter balance); otherwise the starter-token range from the live config.
const Body = z.object({
  minutes: z.number().int().min(0),
  plan: z.enum(["monthly", "annual"]).optional(),
});

// POST /api/office/activate/checkout — first-time activation: one checkout that
// starts access (monthly or annual prepay) AND buys the chosen starter tokens.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (inDemoAccount(user)) return error(DEMO_BILLING_MESSAGE, 403);
  if (!isManagerRole(getActiveRole(user))) return error("Only admins can activate the practice", 403);
  if (!user.officeId) return error("No office assigned", 400);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  const r = await startActivationCheckout({
    officeId: user.officeId,
    customerEmail: user.email,
    origin: process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin,
    minutes: parsed.data.minutes,
    plan: parsed.data.plan,
  });
  return r.ok ? json({ url: r.url }) : error(r.error, r.status, r.code ? { code: r.code } : undefined);
}
