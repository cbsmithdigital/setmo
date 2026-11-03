import { prisma } from "@/lib/db";
import { canStartCallCenter, practiceBlockedMessage } from "@/lib/usage";
import { canStartPartnerCall } from "@/lib/partner-wallet";
import type { PartnerMode, ServiceKey } from "@/generated/prisma/client";

// Who may start a practice call, for which office, on which call type — shared
// by a new session and by "call them back", so a callback can never get around
// what starting the call in the first place required.

/** A call-center user may only call for offices they're assigned (an agent),
 *  their pod serves (a floor manager), or the call center serves (a senior). */
export async function callCenterOfficeInScope(
  user: { id: string; role: string; callCenterPodId: string | null },
  orgId: string,
  officeId: string
): Promise<boolean> {
  if (user.role === "SETTER") {
    return Boolean(await prisma.agentOffice.findUnique({ where: { userId_officeId: { userId: user.id, officeId } } }));
  }
  if (user.callCenterPodId) {
    return Boolean(await prisma.office.findFirst({ where: { id: officeId, servedByPodId: user.callCenterPodId }, select: { id: true } }));
  }
  return Boolean(await prisma.office.findFirst({ where: { id: officeId, servedByPod: { organizationId: orgId } }, select: { id: true } }));
}

/** Why a call can't start, for callers that answer in codes (the Partner API). */
export type PracticeClosedReason = "call_type_unavailable" | "insufficient_tokens" | "access_off" | "partner_disabled";

/** The office must offer this call type, the call type must be open (live for
 *  everyone, or in beta for the offices piloting it), and the pool the call
 *  draws must have time left — the partner's wallet (a call started through a
 *  partner's API), the call center's, or the office's, which also needs current
 *  Practice Access (leftover tokens don't work without it). */
export async function checkPracticeOpen(opts: {
  officeId: string;
  serviceType: ServiceKey;
  callCenterOrgId: string | null;
  partner?: { id: string; mode: PartnerMode } | null;
}): Promise<{ ok: true; agentId: string } | { ok: false; error: string; code: number; reason: PracticeClosedReason }> {
  const [officeService, agent] = await Promise.all([
    prisma.officeService.findUnique({ where: { officeId_serviceType: { officeId: opts.officeId, serviceType: opts.serviceType } } }),
    prisma.agent.findUnique({ where: { serviceType: opts.serviceType } }),
  ]);
  const open = agent?.status === "LIVE" || (agent?.status === "BETA" && officeService?.pilot);
  if (!agent || !officeService?.enabled || !open) {
    return { ok: false, error: "That service isn't available for this office yet", code: 403, reason: "call_type_unavailable" };
  }
  // No auto-overage: block when the pool is exhausted (or the office's access is off).
  if (opts.partner) {
    // The partner bills its practices and SetMo bills the partner, so its wallet
    // is the only gate — the location needs no Practice Access of its own.
    const partner = await prisma.partner.findUnique({ where: { id: opts.partner.id }, select: { status: true } });
    if (partner?.status !== "APPROVED") {
      return { ok: false, error: "Practice calls through this partner are switched off. Contact the SetMo team.", code: 403, reason: "partner_disabled" };
    }
    const allowance = await canStartPartnerCall(opts.partner.id, opts.partner.mode);
    if (!allowance.ok) {
      return { ok: false, error: "The practice token balance is used up, so new calls can't start until more tokens are added.", code: 402, reason: "insufficient_tokens" };
    }
  } else if (opts.callCenterOrgId) {
    const allowance = await canStartCallCenter(opts.callCenterOrgId);
    if (!allowance.ok) return { ok: false, error: "Your call center's practice balance is used up.", code: 402, reason: "insufficient_tokens" };
  } else {
    const blocked = await practiceBlockedMessage(opts.officeId);
    if (blocked) return { ok: false, error: blocked, code: 402, reason: "access_off" };
  }
  return { ok: true, agentId: agent.id };
}

/** The partner wallet a session draws from, if it was started through the Partner API. */
export function sessionPartner(s: { partnerId: string | null; partnerMode: PartnerMode | null }): { id: string; mode: PartnerMode } | null {
  return s.partnerId && s.partnerMode ? { id: s.partnerId, mode: s.partnerMode } : null;
}
