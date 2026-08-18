import { z } from "zod";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { createPod } from "@/lib/callcenter-admin";
import { error, json } from "@/lib/api";

const Body = z.object({ name: z.string().min(1).max(80) });

// POST /api/callcenter/pods — senior manager creates a pod.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (getActiveRole(user) !== "CALL_CENTER_ADMIN" || !user.organizationId) return error("Call-center admins only", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Enter a pod name", 422);
  const pod = await createPod(user.organizationId, parsed.data.name);
  return json({ ok: true, podId: pod.id });
}
