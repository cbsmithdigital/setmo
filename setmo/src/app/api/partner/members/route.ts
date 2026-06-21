import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { invitePartnerMember } from "@/lib/partner-portal";
import { error, json } from "@/lib/api";

const Body = z.object({ email: z.string().email(), name: z.string().min(1).max(120) });

// POST /api/partner/members — partner admin invites a rep (+ issues their code).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.partnerId || getActiveRole(user) !== "PARTNER_ADMIN") return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Enter a name and valid email", 422);

  const res = await invitePartnerMember(user.partnerId, parsed.data.email, parsed.data.name);
  if (!res.ok) return error(res.error ?? "Could not invite", 502);
  return json({ ok: true, inviteLink: res.inviteLink });
}
