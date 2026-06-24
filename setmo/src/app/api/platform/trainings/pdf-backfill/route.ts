import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";

const STAFF = ["PLATFORM_ADMIN", "SUPPORT"];

// GET /api/platform/trainings/pdf-backfill — list uploaded PDFs that have no
// thumbnail yet (the browser then generates + uploads a page-1 thumb for each).
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !STAFF.includes(user.role)) return error("Forbidden", 403);

  const rows = await prisma.training.findMany({
    where: { type: "WORKBOOK", thumbRef: null, assetRef: { not: null } },
    select: { id: true, title: true, assetRef: true },
  });
  // Only uploaded files (not external links) can be rendered.
  const pending = rows.filter((r) => r.assetRef && !/^https?:\/\//i.test(r.assetRef)).map((r) => ({ id: r.id, title: r.title }));
  return json({ pending });
}
