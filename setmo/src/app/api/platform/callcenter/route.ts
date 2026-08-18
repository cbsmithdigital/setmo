import { z } from "zod";
import { getPlatformActor } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { createCallCenter } from "@/lib/callcenter-admin";
import { error, json } from "@/lib/api";

const Body = z.object({ name: z.string().min(2).max(120), adminEmail: z.string().email(), adminName: z.string().max(120).optional() });

// POST /api/platform/callcenter — super-admin creates a call center + first pod
// and invites its senior manager.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Check the fields and try again.", 422);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const res = await createCallCenter({ ...parsed.data, inviterId: actor.id, inviterName: actor.email ?? "SetMo", origin });
    await logAdminAction(actor, { action: "callcenter.create", summary: `Created call center ${parsed.data.name}`, targetType: "organization", targetId: res.orgId });
    return json({ ok: true, ...res });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't create the call center", 502);
  }
}
