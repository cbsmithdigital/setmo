import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isStorageConfigured, createTrainingUploadUrl } from "@/lib/storage";
import { error, json } from "@/lib/api";

const STAFF = ["PLATFORM_ADMIN", "SUPPORT"];
const Body = z.object({ trainingId: z.string(), filename: z.string().min(1).max(200) });

// POST /api/platform/trainings/upload-url — mint a direct-to-storage upload URL
// for a training asset (the browser uploads to it, bypassing the body limit).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !STAFF.includes(user.role)) return error("Forbidden", 403);
  if (!isStorageConfigured()) return error("Storage isn't configured", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);

  const safe = parsed.data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-90);
  const stamp = new URL(req.url).searchParams.get("t") ?? `${Math.floor(Math.random() * 1e9)}`;
  const path = `${parsed.data.trainingId}/${stamp}-${safe}`;

  try {
    const { path: p, token } = await createTrainingUploadUrl(path);
    return json({ path: p, token, bucket: "trainings" });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Could not create upload URL", 502);
  }
}
