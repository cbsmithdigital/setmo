import { prisma } from "@/lib/db";
import { memoryForService } from "@/lib/memory";
import { packFor } from "@/lib/packs/registry";
import { buildImplantLead, buildPackLead, type BuiltLead } from "@/lib/realism/build-lead";
import type { Difficulty } from "@/lib/personas";
import type { LeadChoice } from "@/lib/realism/types";
import type { ServiceKey } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// The lead for a practice session. It's composed ONCE — when the setter opens
// the call screen, so they can read the lead card first — saved on the session,
// and then reused as-is by the call itself and by any reconnect. The setter can't
// reroll the person by reloading, and the card can never describe someone other
// than who picks up.
// ---------------------------------------------------------------------------

type SessionForLead = {
  id: string;
  setterId: string;
  serviceType: string;
  difficulty: Difficulty;
  personaSeed: unknown;
};

type OfficeFacts = { name?: string | null; city?: string | null; offerFraming?: string | null; appointmentFraming?: string | null };

/** True once a lead has been composed for the session (implant persona or pack
 *  skeleton). A fresh session only carries its settings, marked `hidden`. */
export function hasComposedLead(seed: unknown): boolean {
  const s = seed as Record<string, unknown> | null;
  return Boolean(s && s.hidden !== true && (typeof s.name === "string" || s.skeleton));
}

/** How long after a lead's first call the setter can still call them back
 *  (carried through a chain of callbacks). */
export const CALLBACK_WINDOW_MS = 30 * 60 * 1000;

/** When the first call to this session's lead started — the callback window
 *  runs from there, through every callback after it. */
export function callbackRootStart(session: { startedAt: Date; personaSeed: unknown }): Date {
  const root = (session.personaSeed as Record<string, unknown> | null)?.callbackRootStartedAt;
  return typeof root === "string" ? new Date(root) : session.startedAt;
}

type SessionInPlay = { id: string; setterId: string; kind: string; isAudit: boolean; status: string; startedAt: Date; personaSeed: unknown };

/** Whether a call's lead is still in play: the call dropped and can still be
 *  called back, or a callback of it is under way. A dropped call is scored on
 *  its own as soon as its recording arrives (often seconds after the drop), so
 *  while its lead is in play the results keep the lead's real reason and
 *  hesitation back — the setter may be about to talk to them again.
 *  `canCallBack`: this call itself is the one that dropped and is waiting on the
 *  setter's choice. */
export async function leadInPlay(session: SessionInPlay): Promise<{ inPlay: boolean; canCallBack: boolean; until: Date }> {
  const until = new Date(callbackRootStart(session).getTime() + CALLBACK_WINDOW_MS);
  const seed = (session.personaSeed ?? {}) as Record<string, unknown>;
  const out = { inPlay: false, canCallBack: false, until };
  if (session.kind !== "PRACTICE" || session.isAudit || !hasComposedLead(seed) || Date.now() > until.getTime()) return out;
  if (seed.callbackState === "open") return { inPlay: true, canCallBack: true, until };

  // Called back: follow the callbacks to the newest one. The lead is in play
  // until that call ends on purpose.
  let prevId = session.id;
  let state = seed.callbackState;
  for (let hop = 0; hop < 10 && state === "used"; hop++) {
    const next = await prisma.session.findFirst({
      where: { setterId: session.setterId, personaSeed: { path: ["callbackOf"], equals: prevId } },
      select: { id: true, status: true, personaSeed: true },
    });
    if (!next) return out;
    state = (next.personaSeed as Record<string, unknown> | null)?.callbackState;
    // Waiting to start, still connecting, live, or dropped in turn.
    if (next.status === "CREATED" || (next.status === "IN_PROGRESS" && state === undefined) || state === "open") {
      return { inPlay: true, canCallBack: false, until };
    }
    prevId = next.id;
  }
  return out;
}

/** The challenge level this session's lead plays at. Fixed when the session was
 *  created (adaptive resolves from the setter's level on THIS call type), so the
 *  card, the call and a reconnect all agree. */
export async function resolveDifficulty(session: SessionForLead): Promise<Difficulty> {
  const stored = (session.personaSeed as Record<string, unknown> | null)?.resolvedDifficulty;
  if (stored === "WARM" || stored === "ADAPTIVE" || stored === "TOUGH") return stored;
  if (session.difficulty !== "ADAPTIVE") return session.difficulty;
  const memoryRow = await prisma.setterMemory.findUnique({ where: { setterId: session.setterId } });
  return memoryForService(memoryRow, session.serviceType as ServiceKey).difficultyFloor;
}

/** Build (or rebuild from storage) this session's lead, and the seed to store:
 *  the session's own settings (difficulty, "pick your lead") plus the lead. */
export async function buildSessionLead(opts: {
  session: SessionForLead;
  office: OfficeFacts;
  setterFirstName?: string | null;
  difficulty: Difficulty;
}): Promise<{ lead: BuiltLead; seedToStore: Record<string, unknown> }> {
  const seed = (opts.session.personaSeed ?? {}) as Record<string, unknown>;
  const stored = hasComposedLead(seed) ? seed : null;
  const choice = (seed.choice ?? null) as LeadChoice | null;
  const pack = packFor(opts.session.serviceType);
  const lead = pack?.persona
    ? await buildPackLead({
        pack,
        seed: opts.session.id,
        difficulty: opts.difficulty,
        office: opts.office,
        setterFirstName: opts.setterFirstName,
        stored,
        choice,
      })
    : await buildImplantLead({
        difficulty: opts.difficulty,
        office: opts.office,
        setterFirstName: opts.setterFirstName,
        stored,
        choice,
      });

  // "Call them back" after a dropped call: same person, and they know it. A lead
  // with a card says so in what the practice has on file; an older one without
  // a card gets the same line here.
  const hasCard = Boolean((seed.skeleton as { card?: unknown } | undefined)?.card ?? seed.card);
  if (typeof seed.callbackOf === "string" && !hasCard) {
    lead.systemPrompt += `\n\nTHIS IS A CALLBACK\n- You were on the phone with this setter a few minutes ago and the line cut out; they're calling you back. You remember the call had started, but you don't need to recap it — let them lead.`;
  }

  const carry = { ...seed };
  delete carry.hidden;
  return { lead, seedToStore: { ...carry, ...lead.seed, resolvedDifficulty: opts.difficulty } };
}
