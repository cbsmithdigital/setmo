import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";

const Body = z.object({ saved: z.boolean() });

// POST /api/sessions/:id/save — flag (or unflag) a recording to keep.
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

  await prisma.session.update({
    where: { id },
    data: { saved: parsed.data.saved, savedAt: parsed.data.saved ? new Date() : null },
  });
  return json({ saved: parsed.data.saved });
}
