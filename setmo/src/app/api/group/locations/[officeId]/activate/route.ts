import { z } from "zod";
import { groupBuyer } from "@/lib/group-location";
import { startActivationCheckout } from "@/lib/checkout";
import { error, json } from "@/lib/api";

const Body = z.object({
  minutes: z.number().int().min(0),
  plan: z.enum(["monthly", "annual"]).optional(),
});

// POST /api/group/locations/:officeId/activate — a group admin activates one of
// the group's locations (Practice Access + starter tokens), same checkout as the
// location's own Billing page; it comes back to the group's Locations page.
export async function POST(req: Request, { params }: { params: Promise<{ officeId: string }> }) {
  const { officeId } = await params;
  const buyer = await groupBuyer(officeId);
  if (!buyer.ok) return error(buyer.error, buyer.status);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  const r = await startActivationCheckout({
    officeId,
    customerEmail: buyer.email,
    origin: process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin,
    returnPath: "/group/locations",
    minutes: parsed.data.minutes,
    plan: parsed.data.plan,
  });
  return r.ok ? json({ url: r.url }) : error(r.error, r.status, r.code ? { code: r.code } : undefined);
}
