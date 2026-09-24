import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { invitePartnerMember, disablePartnerMember } from "@/lib/partner-portal";
import { error, json } from "@/lib/api";

const Body = z.object({ email: z.string().email(), name: z.string().min(1).max(120) });

// POST /api/partner/members — partner admin invites a rep (+ issues their code
// and demo access). Re-inviting the same person is safe.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.partnerId || getActiveRole(user) !== "PARTNER_ADMIN") return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Enter a name and valid email", 422);

  const res = await invitePartnerMember(user.partnerId, parsed.data.email, parsed.data.name);
  if (!res.ok) return error(res.error ?? "Could not invite", 422);
  return json({ ok: true, inviteLink: res.inviteLink });
}

const Remove = z.object({ userId: z.string().min(1) });

// DELETE /api/partner/members — partner admin removes a rep. Their access and
// demo access end; practices already holding their link are still credited.
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.partnerId || getActiveRole(user) !== "PARTNER_ADMIN") return error("Forbidden", 403);
  const parsed = Remove.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  if (parsed.data.userId === user.id) return error("You can't remove yourself.", 422);

  const res = await disablePartnerMember(user.partnerId, parsed.data.userId);
  if (!res.ok) return error(res.error ?? "Could not remove", 404);
  return json({ ok: true });
}
