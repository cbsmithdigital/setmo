import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { agentIdFor, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { buildSessionLead, hasComposedLead, resolveDifficulty } from "@/lib/session-lead";
import { leadCardFromSeed } from "@/lib/realism/lead-card";
import { packFor } from "@/lib/packs/registry";
import { error, json } from "@/lib/api";
import type { ServiceKey } from "@/generated/prisma/client";

// Composing a lead is one or two short model calls.
export const maxDuration = 60;

type SessionState = { status: string; completedAt: Date | null; personaSeed: unknown };

// POST /api/sessions/:id/prepare — compose this session's lead (once) and return
// its lead card: what the practice has on file before the setter dials. Safe to
// call again (a reload): it returns the same lead, never a new one, and says
// where the call stands —
//   • ended (by the setter, the lead or the time limit) → the scoring screen;
//   • connected and then cut off → "call them back" or feedback;
//   • claimed but never connected (mic blocked, network) → the card again, and
//     Start tries the same session once more.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const { id } = await params;
  const session = await prisma.session.findFirst({
    where: { id, setterId: user.id },
    include: { office: { select: { name: true, city: true, offerFraming: true, appointmentFraming: true } } },
  });
  if (!session) return error("Session not found", 404);

  const respond = (s: SessionState) => {
    if (s.status === "SCORED" || s.status === "COMPLETED" || s.status === "FAILED") return json({ finished: true, status: s.status });
    // Ended and waiting on its score.
    if (s.status === "IN_PROGRESS" && s.completedAt) return json({ finished: true, status: "COMPLETED" });
    const seed = (s.personaSeed ?? {}) as Record<string, unknown>;
    const card = leadCardFromSeed(seed);
    return json({
      ready: true,
      card,
      choiceLabel: typeof seed.choiceLabel === "string" ? seed.choiceLabel : null,
      // The challenge the setter PICKED — an adaptive lead's actual level is
      // part of what the call keeps hidden until the reveal.
      difficulty: session.difficulty,
      // The offer only shows for a lead that answered an ad for it: the office's
      // own offer on the implant call, the call type's ad on every other.
      offer: !card?.fromAd
        ? null
        : session.serviceType === "IMPLANT"
          ? session.office?.offerFraming ?? null
          : packFor(session.serviceType)?.adOffer ?? null,
      callback: typeof seed.callbackOf === "string",
      interrupted: s.status === "IN_PROGRESS" && Boolean(seed.connectedAt),
    });
  };

  if (hasComposedLead(session.personaSeed) || session.status !== "CREATED") return respond(session);

  // Don't spend a lead on a call type that has nowhere to connect.
  if (isElevenLabsConfigured() && !agentIdFor(session.serviceType as ServiceKey)) {
    return json({ ready: false });
  }

  const difficulty = await resolveDifficulty(session);
  const { seedToStore } = await buildSessionLead({
    session,
    office: session.office ?? {},
    setterFirstName: user.firstName,
    difficulty,
  });

  // Save it only if no lead was saved meanwhile (a double load, or a quick
  // Start) — whichever lead was saved first is the one the setter calls.
  const saved = await prisma.session.updateMany({
    where: { id: session.id, status: "CREATED", personaSeed: { path: ["hidden"], equals: true } },
    data: { personaSeed: seedToStore as object },
  });
  if (saved.count === 0) {
    const fresh = await prisma.session.findUnique({ where: { id: session.id }, select: { status: true, completedAt: true, personaSeed: true } });
    return fresh ? respond(fresh) : error("Session not found", 404);
  }
  return respond({ status: "CREATED", completedAt: null, personaSeed: seedToStore });
}
