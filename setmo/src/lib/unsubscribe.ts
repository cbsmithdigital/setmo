import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, stateless unsubscribe tokens for digest emails — no per-user secret to
// store. token = HMAC_SHA256(userId) with a server secret, hex. Stable in prod
// (CRON_SECRET is always set there); a dev fallback keeps local links working.
function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || "setmo-dev-unsub-secret";
}

export function unsubscribeToken(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("hex");
}

export function verifyUnsubscribe(userId: string, token: string): boolean {
  if (!userId || !token) return false;
  try {
    const a = Buffer.from(token, "hex");
    const b = Buffer.from(unsubscribeToken(userId), "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** The human-facing unsubscribe page link embedded in the email footer. */
export function unsubscribeUrl(userId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://setmo.growdental.ai";
  return `${base}/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}
