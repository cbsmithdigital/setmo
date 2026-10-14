import { z } from "zod";
import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { startTokenCheckout } from "@/lib/checkout";
import { error, json } from "@/lib/api";
import { inDemoAccount, DEMO_BILLING_MESSAGE } from "@/lib/demo-shared";

const Body = z.object({ minutes: z.number().int().min(1) });

// POST /api/office/minutes/checkout — buy tokens (slider amount).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (inDemoAccount(user)) return error(DEMO_BILLING_MESSAGE, 403);
  if (!isManagerRole(getActiveRole(user))) return error("Only admins can purchase minutes", 403);
  if (!user.officeId) return error("No office assigned", 400);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid minute amount", 422);

  const r = await startTokenCheckout({
    officeId: user.officeId,
    customerEmail: user.email,
    origin: process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin,
    minutes: parsed.data.minutes,
  });
  return r.ok ? json({ url: r.url }) : error(r.error, r.status, r.code ? { code: r.code } : undefined);
}
