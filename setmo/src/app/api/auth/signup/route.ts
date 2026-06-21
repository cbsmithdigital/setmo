import { z } from "zod";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { provisionAccount } from "@/lib/provision";
import { error, json } from "@/lib/api";

const Body = z.object({
  kind: z.enum(["practice", "group"]),
  contactName: z.string().min(1).max(120),
  practiceName: z.string().min(1).max(160),
  orgName: z.string().max(160).optional().nullable(),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  ref: z.string().max(60).optional().nullable(),
});

// POST /api/auth/signup — self-serve account creation. Free signup; the practice
// activates Practice Access + buys minutes from the billing page afterward.
export async function POST(req: Request) {
  if (!isAdminConfigured()) return error("Signup isn't configured yet", 503);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Check the form and try again.", 422);
  const b = parsed.data;

  const res = await provisionAccount({
    kind: b.kind,
    practiceName: b.practiceName,
    orgName: b.orgName ?? undefined,
    contactName: b.contactName,
    email: b.email,
    password: b.password,
    referralCode: b.ref ?? undefined,
  });
  if (!res.ok) return error(res.error, res.code);
  return json({ ok: true });
}
