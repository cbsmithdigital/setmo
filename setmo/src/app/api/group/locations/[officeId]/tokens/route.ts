import { z } from "zod";
import { groupBuyer } from "@/lib/group-location";
import { startTokenCheckout } from "@/lib/checkout";
import { error, json } from "@/lib/api";

const Body = z.object({ minutes: z.number().int().min(1) });

// POST /api/group/locations/:officeId/tokens — a group admin buys tokens for one
// of the group's locations; checkout comes back to the Locations page.
export async function POST(req: Request, { params }: { params: Promise<{ officeId: string }> }) {
  const { officeId } = await params;
  const buyer = await groupBuyer(officeId);
  if (!buyer.ok) return error(buyer.error, buyer.status);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid minute amount", 422);

  const r = await startTokenCheckout({
    officeId,
    customerEmail: buyer.email,
    origin: process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin,
    returnPath: "/group/locations",
    minutes: parsed.data.minutes,
  });
  return r.ok ? json({ url: r.url }) : error(r.error, r.status, r.code ? { code: r.code } : undefined);
}
