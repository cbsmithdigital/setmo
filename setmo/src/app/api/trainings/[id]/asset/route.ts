import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getTrainingAssetUrl } from "@/lib/storage";
import { error } from "@/lib/api";

const STAFF = ["PLATFORM_ADMIN", "SUPPORT"];

// GET /api/trainings/:id/asset — redirect to the training's video/workbook.
// Published trainings are viewable by any signed-in user; drafts by staff only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const { id } = await params;

  const t = await prisma.training.findUnique({ where: { id }, select: { status: true, assetRef: true } });
  if (!t || !t.assetRef) return error("Not found", 404);
  if (t.status !== "PUBLISHED" && !STAFF.includes(user.role)) return error("Not found", 404);

  // External link (Vimeo/YouTube/etc.) → straight redirect.
  if (/^https?:\/\//i.test(t.assetRef)) return NextResponse.redirect(t.assetRef);

  // Uploaded file → short-lived signed URL.
  const url = await getTrainingAssetUrl(t.assetRef);
  if (!url) return error("Asset unavailable", 404);
  return NextResponse.redirect(url);
}
