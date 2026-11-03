import { prisma } from "@/lib/db";
import { hashSecret, randomSecret } from "@/lib/partner-api";
import type { PartnerMode, Role } from "@/generated/prisma/client";

// ===========================================================================
// Opening a partner call inside the partner's app. The partner's server asks
// for a launch link (POST /api/v1/sessions or …/launch) and puts it in an
// iframe. The link's token works ONCE and expires in minutes; opening it gives
// the page a frame token, held only in the page's memory and sent as a bearer
// header with each call request. No cookies: browsers don't send them to a
// frame from another site, and nothing here should survive the frame.
// ===========================================================================

const LAUNCH_TTL_MS = 10 * 60_000;
// Long enough for the lead card, a full 30-minute call and the wait for the score.
const FRAME_TTL_MS = 4 * 3600_000;

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://setmo.growdental.ai").replace(/\/$/, "");

export async function mintLaunch(sessionId: string, partnerId: string): Promise<{ url: string; expires_at: string }> {
  const token = randomSecret(24);
  const expiresAt = new Date(Date.now() + LAUNCH_TTL_MS);
  await prisma.partnerLaunch.create({ data: { sessionId, partnerId, tokenHash: hashSecret(token), expiresAt } });
  return { url: `${appUrl()}/embed/${token}`, expires_at: expiresAt.toISOString() };
}

/** The sites allowed to frame the page a launch link opens (for the CSP). */
export async function embedFrameAncestors(launchToken: string): Promise<string[]> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(launchToken)) return [];
  const launch = await prisma.partnerLaunch.findUnique({
    where: { tokenHash: hashSecret(launchToken) },
    select: { session: { select: { partnerId: true, partnerMode: true } } },
  });
  const s = launch?.session;
  if (!s?.partnerId || !s.partnerMode) return [];
  const integration = await prisma.partnerIntegration.findUnique({
    where: { partnerId_mode: { partnerId: s.partnerId, mode: s.partnerMode } },
    select: { allowedOrigins: true },
  });
  return integration?.allowedOrigins ?? [];
}

export type OpenedLaunch = {
  sessionId: string;
  frameToken: string;
  partnerId: string;
  mode: PartnerMode;
  allowedOrigins: string[];
  accentColor: string | null;
};

/** Use a launch link: once, before it expires. Returns the frame token. */
export async function openLaunch(token: string): Promise<{ ok: true; launch: OpenedLaunch } | { ok: false; reason: "invalid" | "used" | "expired" }> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false, reason: "invalid" };
  const tokenHash = hashSecret(token);
  const row = await prisma.partnerLaunch.findUnique({
    where: { tokenHash },
    select: { id: true, usedAt: true, expiresAt: true, sessionId: true, session: { select: { partnerId: true, partnerMode: true } } },
  });
  if (!row || !row.session.partnerId || !row.session.partnerMode) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  const frameToken = randomSecret(32);
  const claimed = await prisma.partnerLaunch.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date(), frameTokenHash: hashSecret(frameToken), frameExpiresAt: new Date(Date.now() + FRAME_TTL_MS) },
  });
  if (claimed.count === 0) return { ok: false, reason: "used" };

  const integration = await prisma.partnerIntegration.findUnique({
    where: { partnerId_mode: { partnerId: row.session.partnerId, mode: row.session.partnerMode } },
    select: { allowedOrigins: true, accentColor: true },
  });
  return {
    ok: true,
    launch: {
      sessionId: row.sessionId,
      frameToken,
      partnerId: row.session.partnerId,
      mode: row.session.partnerMode,
      allowedOrigins: integration?.allowedOrigins ?? [],
      accentColor: integration?.accentColor ?? null,
    },
  };
}

/** The person a call request acts for — what the session routes need of a user. */
export type SessionActor = {
  id: string;
  role: Role;
  activeRole?: Role;
  firstName: string | null;
  officeId: string | null;
  organizationId: string | null;
  callCenterPodId: string | null;
  /** Set when the request came from an embedded partner call. */
  embed?: { partnerId: string; sessionId: string };
};

/** A request from the embedded call screen: `Authorization: Bearer <frame token>`
 *  for THIS session. Returns the trainee, or null if the token is missing, wrong,
 *  expired, or for another call. */
export async function frameActor(req: Request, sessionId: string): Promise<SessionActor | null> {
  const token = (req.headers.get("authorization") ?? "").match(/^Bearer\s+([A-Za-z0-9_-]{20,80})$/i)?.[1];
  if (!token) return null;
  const launch = await prisma.partnerLaunch.findUnique({
    where: { frameTokenHash: hashSecret(token) },
    select: { sessionId: true, partnerId: true, frameExpiresAt: true, session: { select: { setterId: true } } },
  });
  if (!launch || launch.sessionId !== sessionId) return null;
  if (!launch.frameExpiresAt || launch.frameExpiresAt.getTime() < Date.now()) return null;
  const partner = await prisma.partner.findUnique({ where: { id: launch.partnerId }, select: { status: true } });
  if (partner?.status !== "APPROVED") return null;
  const u = await prisma.user.findUnique({
    where: { id: launch.session.setterId },
    select: { id: true, role: true, firstName: true, officeId: true, organizationId: true, callCenterPodId: true, status: true },
  });
  if (!u || u.status === "DISABLED") return null;
  return {
    id: u.id,
    role: u.role,
    activeRole: u.role,
    firstName: u.firstName,
    officeId: u.officeId,
    organizationId: u.organizationId,
    callCenterPodId: u.callCenterPodId,
    embed: { partnerId: launch.partnerId, sessionId },
  };
}

/** Who a session request acts for: the embedded call's frame token when the
 *  request carries one, otherwise the signed-in SetMo user. */
export async function sessionActor(req: Request, sessionId: string): Promise<SessionActor | null> {
  if (req.headers.get("authorization")) return frameActor(req, sessionId);
  const { getCurrentUser } = await import("@/lib/auth");
  return getCurrentUser();
}
