import { z } from "zod";
import { prisma } from "@/lib/db";
import { sessionActor } from "@/lib/partner-launch";
import { after } from "next/server";
import { error, json } from "@/lib/api";
import { emitSessionEvent } from "@/lib/partner-webhooks";

const Body = z.object({ conversationId: z.string().min(1).max(200) });

// POST /api/sessions/:id/live — the browser's signal that the call actually
// connected. It separates a call that dropped mid-conversation (the setter may
// call the same lead back) from one that never got going (Start just tries
// again on the same session), and ties the session to its conversation early so
// a late recording still finds it. Nothing here is trusted for scoring.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A signed-in SetMo user, or an embedded partner call (frame token for this call).
  const user = await sessionActor(req, id);
  if (!user) return error("Unauthorized", 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  const session = await prisma.session.findFirst({ where: { id, setterId: user.id }, select: { id: true, status: true, personaSeed: true, elevenlabsConversationId: true } });
  if (!session) return error("Session not found", 404);
  if (session.status !== "IN_PROGRESS") return json({ ok: true, ignored: true });

  const seed = (session.personaSeed ?? {}) as Record<string, unknown>;
  await prisma.session.update({
    where: { id: session.id },
    data: {
      // The id ElevenLabs assigned when the link was minted stands; the browser's
      // report only fills in for a session that was never given one.
      ...(session.elevenlabsConversationId ? {} : { elevenlabsConversationId: parsed.data.conversationId }),
      personaSeed: { ...seed, connectedAt: new Date().toISOString(), callbackState: "open" } as object,
    },
  });
  // A call started through a partner's API: tell the partner it's under way.
  after(() => emitSessionEvent(session.id, "session.started"));
  return json({ ok: true });
}
