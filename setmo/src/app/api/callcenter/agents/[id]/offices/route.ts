import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { setAgentOffices, resolveManagedOrgId } from "@/lib/callcenter-admin";
import { error, json } from "@/lib/api";

const Body = z.object({ officeIds: z.array(z.string()), orgId: z.string().optional() });

// POST /api/callcenter/agents/:id/offices — senior manager sets which offices an
// agent is assigned to (must belong to the agent's pod). A platform super-admin
// may pass orgId to manage any center.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const orgId = await resolveManagedOrgId(getActiveRole(user), user.organizationId, parsed.data.orgId);
  if (!orgId) return error("Call-center admins only", 403);
  const res = await setAgentOffices({ orgId, agentId: id, officeIds: parsed.data.officeIds });
  if (!res.ok) return error(res.error, 422);
  return json({ ok: true });
}
