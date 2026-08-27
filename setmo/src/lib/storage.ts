import { getAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { prisma } from "@/lib/db";
import { getConversationAudio } from "@/lib/elevenlabs";

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

/**
 * Ensure a session's recording is stored, returning its storage path. Lazily
 * fetches + caches the audio from ElevenLabs when we have a conversation id but
 * the `post_call_audio` webhook never landed (dropped/late/out-of-order — a known
 * gap that silently loses recordings). Returns null if no recording is obtainable
 * (e.g. a zero-retention workspace). Never throws; no-ops without an API key.
 */
export async function ensureRecording(session: {
  id: string;
  officeId: string;
  audioPath: string | null;
  elevenlabsConversationId: string | null;
}): Promise<string | null> {
  if (session.audioPath) return session.audioPath;
  if (!session.elevenlabsConversationId) return null;
  const bytes = await getConversationAudio(session.elevenlabsConversationId);
  if (!bytes) return null;
  const path = `${session.officeId}/${session.id}.mp3`;
  try {
    await uploadRecording(path, bytes);
    await prisma.session.update({ where: { id: session.id }, data: { audioPath: path } });
  } catch {
    return null;
  }
  return path;
}

// ── Training assets (videos / workbook PDFs) ─────────────────────────────────
const TRAININGS_BUCKET = "trainings";

async function ensureTrainingsBucket() {
  const sb = getAdminClient();
  const { data } = await sb.storage.getBucket(TRAININGS_BUCKET);
  if (data) return;
  // No fileSizeLimit override — it must not exceed the project's global max, so
  // we inherit the project default. (Large videos use the paste-link option.)
  const { error } = await sb.storage.createBucket(TRAININGS_BUCKET, { public: false });
  if (error && !/exist/i.test(error.message)) throw new Error(`Bucket create failed: ${error.message}`);
}

/** Create a signed URL the browser uploads a training asset directly to (bypasses
 *  the serverless body-size limit, so large videos work). */
export async function createTrainingUploadUrl(path: string): Promise<{ path: string; token: string }> {
  await ensureTrainingsBucket();
  const sb = getAdminClient();
  const { data, error } = await sb.storage.from(TRAININGS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Upload URL failed: ${error?.message ?? "unknown"}`);
  return { path: data.path, token: data.token };
}

/** Short-lived signed URL to play/download an uploaded training asset. */
export async function getTrainingAssetUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const sb = getAdminClient();
  const { data, error } = await sb.storage.from(TRAININGS_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Remove an uploaded training asset (best-effort). */
export async function deleteTrainingAsset(path: string): Promise<void> {
  const sb = getAdminClient();
  await sb.storage.from(TRAININGS_BUCKET).remove([path]);
}
