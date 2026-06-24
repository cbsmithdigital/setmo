import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";

const STAFF = ["PLATFORM_ADMIN", "SUPPORT"];

const Body = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional().nullable(),
  type: z.enum(["VIDEO", "WORKBOOK"]),
  targetSkillKey: z.string().max(40).optional().nullable(),
  length: z.number().int().min(0).max(100000).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  assetRef: z.string().max(2000).optional().nullable(), // external URL, or set later via upload
});

// POST /api/platform/trainings — create a training (platform staff only).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !STAFF.includes(user.role)) return error("Forbidden", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Check the fields and try again.", 422);
  const b = parsed.data;

  const t = await prisma.training.create({
    data: {
      title: b.title,
      description: b.description ?? null,
      type: b.type,
      targetSkillKey: b.targetSkillKey || null,
      length: b.length ?? 0,
      status: b.status ?? "DRAFT",
      assetRef: b.assetRef || null,
    },
  });
  return json({ id: t.id });
}
