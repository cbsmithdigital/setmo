import { prisma } from "@/lib/db";

// Request limits for the public endpoints. Counters live in Postgres — one atomic
// upsert per hit — so they hold across serverless instances without another
// service. A failure in the counter itself lets the request through: a limit
// must never be what takes a sign-up form down.

/** The caller's IP as Vercel reports it (Vercel overwrites any client-sent value). */
export function clientIp(req: Request): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

type Limit = { key: string; limit: number; windowSeconds: number };

async function hit({ key, limit, windowSeconds }: Limit): Promise<{ ok: boolean; retryAfter: number }> {
  const now = Math.floor(Date.now() / 1000);
  const start = now - (now % windowSeconds);
  const bucket = `${key}:${start}`;
  try {
    const row = await prisma.rateLimit.upsert({
      where: { bucket },
      create: { bucket, count: 1, expiresAt: new Date((start + windowSeconds) * 1000) },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    return { ok: row.count <= limit, retryAfter: start + windowSeconds - now };
  } catch {
    return { ok: true, retryAfter: 0 };
  }
}

/** Count one hit against every limit; ok only if all are within bounds. */
export async function withinLimits(limits: Limit[]): Promise<{ ok: boolean; retryAfter: number }> {
  let ok = true;
  let retryAfter = 0;
  for (const l of limits) {
    const r = await hit(l);
    if (!r.ok) {
      ok = false;
      retryAfter = Math.max(retryAfter, r.retryAfter);
    }
  }
  return { ok, retryAfter };
}

/** A 429 with a Retry-After the browser and our forms understand. */
export function tooMany(retryAfter: number, message = "Too many tries — please wait a little and try again."): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(Math.max(1, retryAfter)) },
  });
}

/** Delete expired counters (daily cron). */
export async function sweepRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}

export const HOUR = 3600;
export const DAY = 86400;
