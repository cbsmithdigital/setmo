import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { downloadRecording } from "@/lib/storage";
import { error } from "@/lib/api";

// GET /api/sessions/:id/audio — stream the call recording from Supabase Storage.
// Access: the setter who owns it, or an admin of that office.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const { id } = await params;
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return error("Not found", 404);

  const isOwner = session.setterId === user.id;
  const isOfficeAdmin =
    ["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role) &&
    user.officeId === session.officeId;
  if (!isOwner && !isOfficeAdmin) return error("Forbidden", 403);

  if (!session.audioPath) return error("No recording for this session", 404);

  const buffer = await downloadRecording(session.audioPath);
  if (!buffer) return error("Recording unavailable", 404);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    },
  });
}
