import { z } from "zod";
import { createPartnerApplication } from "@/lib/partners";
import { error, json } from "@/lib/api";

const Body = z.object({
  name: z.string().min(2).max(160),
  contactName: z.string().min(1).max(120),
  email: z.string().email(),
  orgType: z.string().max(60).optional().nullable(),
  audience: z.string().max(1000).optional().nullable(),
  track: z.enum(["REFERRAL", "DISTRIBUTION"]),
});

// POST /api/partners/apply — public partner application → PENDING for review.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Check the form and try again.", 422);
  const b = parsed.data;
  await createPartnerApplication({ name: b.name, contactName: b.contactName, email: b.email, orgType: b.orgType ?? undefined, audience: b.audience ?? undefined, track: b.track });
  return json({ ok: true });
}
