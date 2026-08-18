import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { createServedOffice } from "@/lib/callcenter-admin";
import { error, json } from "@/lib/api";

const Body = z.object({ name: z.string().min(2).max(120), city: z.string().max(80).optional(), podId: z.string().min(1) });

// POST /api/callcenter/offices — senior manager adds a served practice to a pod.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (getActiveRole(user) !== "CALL_CENTER_ADMIN" || !user.organizationId) return error("Call-center admins only", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Check the fields and try again.", 422);
  const res = await createServedOffice({ orgId: user.organizationId, podId: parsed.data.podId, name: parsed.data.name, city: parsed.data.city });
  if (!res.ok) return error(res.error, 422);
  return json({ ok: true, officeId: res.officeId });
}
