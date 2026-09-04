import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { createPod, resolveManagedOrgId } from "@/lib/callcenter-admin";
import { error, json } from "@/lib/api";

const Body = z.object({ name: z.string().min(1).max(80), orgId: z.string().optional() });

// POST /api/callcenter/pods — senior manager creates a pod (a platform
// super-admin may pass orgId to manage any center).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Enter a pod name", 422);
  const orgId = await resolveManagedOrgId(getActiveRole(user), user.organizationId, parsed.data.orgId);
  if (!orgId) return error("Call-center admins only", 403);
  const pod = await createPod(orgId, parsed.data.name);
  return json({ ok: true, podId: pod.id });
}
