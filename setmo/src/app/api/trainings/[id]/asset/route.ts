import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getTrainingAssetUrl } from "@/lib/storage";
import { error } from "@/lib/api";

const STAFF = ["PLATFORM_ADMIN", "SUPPORT"];

// GET /api/trainings/:id/asset[?kind=thumb] — redirect to the training's
// video/workbook (default) or its thumbnail image (kind=thumb).
// Published trainings are viewable by any signed-in user; drafts by staff only.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind");

  const t = await prisma.training.findUnique({ where: { id }, select: { status: true, assetRef: true, thumbRef: true } });
  if (!t) return error("Not found", 404);
  if (t.status !== "PUBLISHED" && !STAFF.includes(user.role)) return error("Not found", 404);

  const ref = kind === "thumb" ? t.thumbRef : t.assetRef;
  if (!ref) return error("Not found", 404);

  // External link (Vimeo/YouTube/etc.) → straight redirect.
  if (/^https?:\/\//i.test(ref)) return NextResponse.redirect(ref);

  // Uploaded file → short-lived signed URL.
  const url = await getTrainingAssetUrl(ref);
  if (!url) return error("Asset unavailable", 404);
  return NextResponse.redirect(url);
}
