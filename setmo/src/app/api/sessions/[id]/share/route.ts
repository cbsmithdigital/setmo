import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";

const Body = z.object({ enabled: z.boolean() });

// POST /api/sessions/:id/share — create or revoke a read-only share link.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const { id } = await params;
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return error("Not found", 404);

  const canManage =
    session.setterId === user.id ||
    (["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role) && user.officeId === session.officeId);
  if (!canManage) return error("Forbidden", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  if (!parsed.data.enabled) {
    await prisma.session.update({ where: { id }, data: { shareToken: null, sharedAt: null } });
    return json({ enabled: false, shareToken: null, url: null });
  }

  const token = session.shareToken ?? randomBytes(18).toString("base64url");
  if (!session.shareToken) {
    await prisma.session.update({ where: { id }, data: { shareToken: token, sharedAt: new Date(), saved: true, savedAt: session.savedAt ?? new Date() } });
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return json({ enabled: true, shareToken: token, url: `${origin}/shared/${token}` });
}
