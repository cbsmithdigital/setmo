import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor, isPlatformRole, IMPERSONATE_COOKIE } from "@/lib/auth";
import { impersonationCookieValue, IMPERSONATION_MAX_AGE_SECONDS } from "@/lib/impersonation";
import { logAdminAction } from "@/lib/platform";
import { error, json } from "@/lib/api";

const Body = z.object({ userId: z.string().min(1) });

// POST /api/platform/impersonate — start "view as" a user (platform staff only).
// Look-only: while it's on, the app refuses changes (proxy.ts). Staff accounts
// can't be viewed as — that would hand support a super admin's powers.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true, role: true, memberships: { select: { role: true } } },
  });
  if (!target) return error("User not found", 404);
  if (isPlatformRole(target.role) || target.memberships.some((m) => isPlatformRole(m.role))) {
    return error("Staff accounts can't be viewed as.", 403);
  }

  const c = await cookies();
  c.set(IMPERSONATE_COOKIE, impersonationCookieValue(target.id, actor.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IMPERSONATION_MAX_AGE_SECONDS,
  });
  await logAdminAction(actor, { action: "impersonate.start", summary: `Started viewing as ${target.email}`, targetType: "user", targetId: target.id });
  return json({ ok: true });
}

// DELETE /api/platform/impersonate — stop impersonating.
export async function DELETE() {
  const actor = await getPlatformActor();
  const c = await cookies();
  c.delete(IMPERSONATE_COOKIE);
  if (actor) await logAdminAction(actor, { action: "impersonate.stop", summary: "Stopped impersonating" });
  return json({ ok: true });
}
