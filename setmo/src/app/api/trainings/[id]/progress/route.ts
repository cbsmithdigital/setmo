import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";

// POST /api/trainings/:id/progress — mark a recommended training as completed
// for the current setter. (Workbook page-progress can extend this later.)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const { id } = await params;
  await prisma.recommendation.updateMany({
    where: { setterId: user.id, trainingId: id, status: "ACTIVE" },
    data: { status: "COMPLETED" },
  });

  return json({ ok: true });
}
