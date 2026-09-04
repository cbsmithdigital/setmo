import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { inviteCallCenterMember, resolveManagedOrgId } from "@/lib/callcenter-admin";
import { fullName } from "@/lib/format";
import { error, json } from "@/lib/api";

const Body = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  role: z.enum(["CALL_CENTER_MANAGER", "SETTER"]),
  podId: z.string().min(1),
  officeIds: z.array(z.string()).optional(), // agents only
  orgId: z.string().optional(), // platform super-admin only
});

// POST /api/callcenter/members — senior manager invites a floor manager or agent
// (a platform super-admin may pass orgId to manage any center).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Check the fields and try again.", 422);
  const orgId = await resolveManagedOrgId(getActiveRole(user), user.organizationId, parsed.data.orgId);
  if (!orgId) return error("Call-center admins only", 403);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const res = await inviteCallCenterMember({
    orgId,
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role,
    podId: parsed.data.podId,
    officeIds: parsed.data.officeIds,
    inviterId: user.id,
    inviterName: fullName(user.firstName, user.lastName),
    origin,
  });
  if (!res.ok) return error(res.error, 422);
  return json({ ok: true, previewLink: res.previewLink });
}
