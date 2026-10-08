import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";

const Body = z.object({
  conversationId: z.string().optional(),
});

// POST /api/sessions/:id/ended — optional client signal that the call ended.
// Records the ElevenLabs conversation id so the webhook can correlate even if
// the dynamic variable is missing. The authoritative score still comes from the
// post-call webhook; nothing here is trusted for scoring.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const conversationId = parsed.success ? parsed.data.conversationId : undefined;

  const session = await prisma.session.findFirst({
    where: { id, setterId: user.id },
  });
  if (!session) return error("Session not found", 404);

  // A call the setter (or the lead) ended on purpose can't be "called back" —
  // that's for calls that dropped.
  const seed = (session.personaSeed ?? {}) as Record<string, unknown>;
  await prisma.session.update({
    where: { id: session.id },
    data: {
      completedAt: new Date(),
      ...(conversationId ? { elevenlabsConversationId: conversationId } : {}),
      ...(seed.callbackState === "open" ? { personaSeed: { ...seed, callbackState: "closed" } as object } : {}),
    },
  });

  return json({ ok: true });
}
