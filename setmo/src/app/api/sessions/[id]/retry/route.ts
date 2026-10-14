import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkPracticeOpen, callCenterOfficeInScope } from "@/lib/practice-access";
import { CALLBACK_WINDOW_MS, callbackRootStart, hasComposedLead } from "@/lib/session-lead";
import { markCallback } from "@/lib/realism/lead-card";
import { error, json } from "@/lib/api";
import type { ServiceKey } from "@/generated/prisma/client";

// POST /api/sessions/:id/retry — "call them back" after a call DROPPED. Starts a
// NEW session with the SAME lead (same person, same card, told it's a
// callback), instead of reconnecting the old one: the dropped call is still
// scored on its own when its transcript arrives, and can't swallow the callback.
//
// Only for a call that actually connected and was cut off — never one the setter
// (or the lead) ended on purpose — and only once per call. The dropped call may
// already be scored (that happens seconds after a drop); its results keep the
// lead's answers back while it can still be called back (see leadInPlay). It
// can't swap leads: the person is copied, not re-drawn.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const { id } = await params;
  const old = await prisma.session.findFirst({ where: { id, setterId: user.id } });
  if (!old) return error("Session not found", 404);
  const seed = (old.personaSeed ?? {}) as Record<string, unknown>;

  const cantCallBack = (why: string) => error(why, 409);
  if (old.isAudit || old.kind !== "PRACTICE" || !hasComposedLead(seed)) return cantCallBack("This call can't be called back.");
  if (!(old.status === "IN_PROGRESS" || old.status === "SCORED") || seed.callbackState !== "open") {
    return cantCallBack("Only a call that dropped can be called back — start a new call.");
  }
  const rootStart = callbackRootStart(old);
  if (Date.now() - rootStart.getTime() > CALLBACK_WINDOW_MS) return cantCallBack("It's been too long to call this lead back — start a new call.");

  // Starting the callback needs everything starting the call did.
  if (old.callCenterOrgId && !(await callCenterOfficeInScope(user, old.callCenterOrgId, old.officeId))) {
    return error("That office isn't in your call center", 403);
  }
  const access = await checkPracticeOpen({ officeId: old.officeId, serviceType: old.serviceType as ServiceKey, callCenterOrgId: old.callCenterOrgId });
  if (!access.ok) return error(access.error, access.code);

  // Once per call: claim the callback before creating it.
  const claimed = await prisma.session.updateMany({
    where: { id: old.id, status: { in: ["IN_PROGRESS", "SCORED"] }, personaSeed: { path: ["callbackState"], equals: "open" } },
    data: { personaSeed: { ...seed, callbackState: "used" } as object },
  });
  if (claimed.count === 0) return cantCallBack("This call was already called back — start a new call.");

  // The fresh session: the same lead, marked as a callback, with this call's own
  // connection markers cleared.
  const fresh = markCallback(seed);
  delete fresh.connectedAt;
  delete fresh.callbackState;
  delete fresh.priorConversationIds; // the dropped call's links stay with the dropped call
  fresh.callbackOf = old.id;
  fresh.callbackRootStartedAt = rootStart.toISOString();

  const session = await prisma.session.create({
    data: {
      setterId: user.id,
      officeId: old.officeId,
      callCenterOrgId: old.callCenterOrgId,
      serviceType: old.serviceType,
      agentId: old.agentId ?? access.agentId,
      difficulty: old.difficulty,
      status: "CREATED",
      personaSeed: fresh as object,
    },
  });
  return json({ sessionId: session.id });
}
