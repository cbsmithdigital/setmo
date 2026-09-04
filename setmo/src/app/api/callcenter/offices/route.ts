import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { createServedOffice, resolveManagedOrgId } from "@/lib/callcenter-admin";
import { error, json } from "@/lib/api";

const Body = z.object({ name: z.string().min(2).max(120), city: z.string().max(80).optional(), podId: z.string().min(1), orgId: z.string().optional() });

// POST /api/callcenter/offices — senior manager adds a served practice to a pod
// (a platform super-admin may pass orgId to manage any center).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Check the fields and try again.", 422);
  const orgId = await resolveManagedOrgId(getActiveRole(user), user.organizationId, parsed.data.orgId);
  if (!orgId) return error("Call-center admins only", 403);
  const res = await createServedOffice({ orgId, podId: parsed.data.podId, name: parsed.data.name, city: parsed.data.city });
  if (!res.ok) return error(res.error, 422);
  return json({ ok: true, officeId: res.officeId });
}
