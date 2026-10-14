import { z } from "zod";
import { prisma } from "@/lib/db";
import { loadAuditByCookie } from "@/lib/audit-auth";
import { auditCallConnected } from "@/lib/audit";
import { error, json } from "@/lib/api";

const Body = z.object({ sessionId: z.string().min(1).max(64), conversationId: z.string().max(200).optional() });

// POST /api/audit/:id/live — the browser's signal that the free call connected.
// From here it counts as the prospect's call. If another try already connected
// (a second window), this one is refused and the browser hangs it up.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditByCookie(id);
  if (!audit) return error("Unauthorized", 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { sessionId, conversationId } = parsed.data;

  const counted = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`audit-call:${id}`}))`;
    const open = await tx.session.findMany({
      where: { auditId: id, status: { not: "FAILED" } },
      select: { id: true, personaSeed: true, elevenlabsConversationId: true, evaluation: { select: { id: true } } },
    });
    const mine = open.find((s) => s.id === sessionId);
    if (!mine) return false;
    if (open.some((s) => s.id !== mine.id && (s.evaluation || auditCallConnected(s.personaSeed)))) return false;
    const seed = (mine.personaSeed ?? {}) as Record<string, unknown>;
    await tx.session.update({
      where: { id: mine.id },
      data: {
        personaSeed: { ...seed, connectedAt: seed.connectedAt ?? new Date().toISOString() } as object,
        // The id assigned with the link stands; the browser's only fills a gap.
        ...(mine.elevenlabsConversationId || !conversationId ? {} : { elevenlabsConversationId: conversationId }),
      },
    });
    return true;
  });

  return counted ? json({ ok: true }) : json({ ok: false, error: "Your free call is already running in another window." }, 409);
}
