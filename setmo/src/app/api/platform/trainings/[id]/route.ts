import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deleteTrainingAsset } from "@/lib/storage";
import { error, json } from "@/lib/api";

const STAFF = ["PLATFORM_ADMIN", "SUPPORT"];

const Patch = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  type: z.enum(["VIDEO", "WORKBOOK"]).optional(),
  targetSkillKey: z.string().max(40).optional().nullable(),
  length: z.number().int().min(0).max(100000).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  assetRef: z.string().max(2000).optional().nullable(),
});

// PATCH /api/platform/trainings/:id — update fields (platform staff only).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !STAFF.includes(user.role)) return error("Forbidden", 403);
  const { id } = await params;

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid update", 422);
  const b = parsed.data;

  // If replacing the asset with a new ref, clean up the old uploaded file.
  if (b.assetRef !== undefined) {
    const prev = await prisma.training.findUnique({ where: { id }, select: { assetRef: true } });
    const old = prev?.assetRef;
    if (old && !/^https?:\/\//i.test(old) && old !== b.assetRef) await deleteTrainingAsset(old).catch(() => {});
  }

  await prisma.training.update({
    where: { id },
    data: {
      ...(b.title !== undefined ? { title: b.title } : {}),
      ...(b.description !== undefined ? { description: b.description } : {}),
      ...(b.type !== undefined ? { type: b.type } : {}),
      ...(b.targetSkillKey !== undefined ? { targetSkillKey: b.targetSkillKey || null } : {}),
      ...(b.length !== undefined ? { length: b.length } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(b.assetRef !== undefined ? { assetRef: b.assetRef || null } : {}),
    },
  });
  return json({ ok: true });
}

// DELETE /api/platform/trainings/:id — remove the training + its uploaded asset.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !STAFF.includes(user.role)) return error("Forbidden", 403);
  const { id } = await params;

  const t = await prisma.training.findUnique({ where: { id }, select: { assetRef: true } });
  if (t?.assetRef && !/^https?:\/\//i.test(t.assetRef)) await deleteTrainingAsset(t.assetRef).catch(() => {});
  await prisma.recommendation.deleteMany({ where: { trainingId: id } });
  await prisma.training.delete({ where: { id } });
  return json({ ok: true });
}
