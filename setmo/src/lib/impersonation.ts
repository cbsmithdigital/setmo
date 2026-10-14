import { createHmac, timingSafeEqual } from "node:crypto";

// "View as": platform staff see the app as a customer sees it. The cookie is
// signed and names both the person viewed and the staff member who started it,
// so it can't be hand-made or carried to another login, and it expires. While
// it's set the app is look-only (the proxy refuses changes; see proxy.ts).

const TTL_MS = 2 * 60 * 60 * 1000;

function secret(): string {
  return process.env.IMPERSONATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET || "setmo-dev-impersonate";
}

const sign = (payload: string) => createHmac("sha256", secret()).update(`impersonate:${payload}`).digest("hex");

/** Cookie value for staff member `staffId` viewing as `targetId`. */
export function impersonationCookieValue(targetId: string, staffId: string): string {
  const payload = `${targetId}.${staffId}.${Date.now() + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export const IMPERSONATION_MAX_AGE_SECONDS = TTL_MS / 1000;

/** The user being viewed, if the cookie is genuine, unexpired, and was started
 *  by this same staff member. Anything else is ignored. */
export function readImpersonation(value: string | undefined, staffId: string): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [targetId, ownerId, exp, sig] = parts;
  const payload = `${targetId}.${ownerId}.${exp}`;
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(sign(payload), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  if (ownerId !== staffId || !(Number(exp) > Date.now())) return null;
  return targetId;
}
