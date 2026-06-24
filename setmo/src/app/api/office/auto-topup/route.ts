import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { error, json } from "@/lib/api";

const Body = z.object({ enabled: z.boolean() });

// POST /api/office/auto-topup — turn minute auto top-up on/off for this office.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!isManagerRole(getActiveRole(user))) return error("Only admins can change billing", 403);
  if (!user.officeId) return error("No office assigned", 400);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  // Turning it on resets the alert stage so the next low-balance cycle re-alerts cleanly.
  await prisma.office.update({
    where: { id: user.officeId },
    data: { autoTopUp: parsed.data.enabled, ...(parsed.data.enabled ? { minuteAlertStage: 0 } : {}) },
  });
  return json({ ok: true });
}
