import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { inviteCallCenterMember, resolveManagedOrgId } from "@/lib/callcenter-admin";
import { fullName } from "@/lib/format";
import { error, json } from "@/lib/api";
import { inDemoAccount } from "@/lib/demo-shared";
import { withinLimits, tooMany, HOUR, DAY } from "@/lib/rate-limit";

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
  // Not DEMO_INVITE_MESSAGE: that one sends a partner to their tracking link, and
  // no partner works in a call-center demo.
  if (inDemoAccount(user)) return error("Demo accounts can't invite people.", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Check the fields and try again.", 422);
  const role = getActiveRole(user);
  const orgId = await resolveManagedOrgId(role, user.organizationId, parsed.data.orgId);
  if (!orgId) return error("Call-center admins only", 403);

  // One person per invite here (office invites take up to 25 a send), so these
  // count people; enough to set up a pod in a sitting, not to mass-mail. The
  // platform super-admin, who builds whole centers out, isn't held to them.
  if (role !== "PLATFORM_ADMIN") {
    const limit = await withinLimits([
      { key: `cc-invites:${user.id}`, limit: 20, windowSeconds: HOUR },
      { key: `cc-invites-day:${user.id}`, limit: 50, windowSeconds: DAY },
    ]);
    if (!limit.ok) return tooMany(limit.retryAfter, "You've sent a lot of invites in a short time — please wait a little before sending more.");
  }

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
