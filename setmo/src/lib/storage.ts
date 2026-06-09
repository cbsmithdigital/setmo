import { getAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

const BUCKET = "recordings";

export function isStorageConfigured(): boolean {
  return isAdminConfigured();
}

// Ensure the private recordings bucket exists (idempotent).
async function ensureBucket() {
  const sb = getAdminClient();
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    await sb.storage.createBucket(BUCKET, { public: false });
  }
}

/** Upload a call recording. Returns the storage path. */
export async function uploadRecording(
  path: string,
  body: Buffer,
  contentType = "audio/mpeg"
): Promise<string> {
  const sb = getAdminClient();
  await ensureBucket();
  const { error } = await sb.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

/** Download a recording as a Buffer, or null if missing. */
export async function downloadRecording(path: string): Promise<Buffer | null> {
  const sb = getAdminClient();
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
