import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";

const Body = z.object({ conversationId: z.string().min(1).max(200) });

// POST /api/sessions/:id/live — the browser's signal that the call actually
// connected. It separates a call that dropped mid-conversation (the setter may
// call the same lead back) from one that never got going (Start just tries
// again on the same session), and ties the session to its conversation early so
// a late recording still finds it. Nothing here is trusted for scoring.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  const session = await prisma.session.findFirst({ where: { id, setterId: user.id }, select: { id: true, status: true, personaSeed: true } });
  if (!session) return error("Session not found", 404);
  if (session.status !== "IN_PROGRESS") return json({ ok: true, ignored: true });

  const seed = (session.personaSeed ?? {}) as Record<string, unknown>;
  await prisma.session.update({
    where: { id: session.id },
    data: {
      elevenlabsConversationId: parsed.data.conversationId,
      personaSeed: { ...seed, connectedAt: new Date().toISOString(), callbackState: "open" } as object,
    },
  });
  return json({ ok: true });
}
