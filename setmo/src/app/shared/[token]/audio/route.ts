import { prisma } from "@/lib/db";
import { downloadRecording } from "@/lib/storage";
import { error } from "@/lib/api";

// GET /shared/:token/audio — public recording stream for a shared call (the
// token is the access control). No login.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await prisma.session.findUnique({ where: { shareToken: token } });
  if (!session?.shareToken || !session.audioPath) return error("Not found", 404);

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
