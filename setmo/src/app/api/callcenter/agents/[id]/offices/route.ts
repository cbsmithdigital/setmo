import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { setAgentOffices } from "@/lib/callcenter-admin";
import { error, json } from "@/lib/api";

const Body = z.object({ officeIds: z.array(z.string()) });

// POST /api/callcenter/agents/:id/offices — senior manager sets which offices an
// agent is assigned to (must belong to the agent's pod).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (getActiveRole(user) !== "CALL_CENTER_ADMIN" || !user.organizationId) return error("Call-center admins only", 403);
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const res = await setAgentOffices({ orgId: user.organizationId, agentId: id, officeIds: parsed.data.officeIds });
  if (!res.ok) return error(res.error, 422);
  return json({ ok: true });
}
