import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { downloadRecording, ensureRecording } from "@/lib/storage";
import { error } from "@/lib/api";

// GET /api/sessions/:id/audio — stream the call recording from Supabase Storage.
// Access mirrors getSessionResult: whoever can view the result can play it.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const { id } = await params;
  const session = await prisma.session.findUnique({ where: { id }, include: { office: { select: { organizationId: true } }, setter: { select: { callCenterPodId: true } } } });
  if (!session) return error("Not found", 404);

  const isOwner = session.setterId === user.id;
  const isOfficeAdmin =
    ["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role) &&
    user.officeId === session.officeId;
  const isPlatform = user.role === "PLATFORM_ADMIN";
  // Group leaders may play any call in their organization's offices.
  const isGroup = Boolean(user.role === "GROUP_ADMIN" && user.organizationId && session.office?.organizationId === user.organizationId);
  // Call-center managers: senior = any of the center's agent calls; floor = pod only.
  const isCallCenter = Boolean(
    session.callCenterOrgId &&
    user.organizationId &&
    user.organizationId === session.callCenterOrgId &&
    (user.role === "CALL_CENTER_ADMIN" ||
      (user.role === "CALL_CENTER_MANAGER" && user.callCenterPodId != null && user.callCenterPodId === session.setter?.callCenterPodId))
  );
  // A Multi Practice Admin may play calls for any office in their assigned set —
  // membership PLUS an org check (fail-closed, matching mpaOfficeIds).
  const isMpa =
    user.role === "MULTI_PRACTICE_ADMIN" &&
    Boolean(user.organizationId && session.office?.organizationId === user.organizationId) &&
    Boolean(await prisma.membership.findFirst({ where: { userId: user.id, role: "MULTI_PRACTICE_ADMIN", scopeType: "OFFICE", scopeId: session.officeId } }));
  if (!isOwner && !isOfficeAdmin && !isPlatform && !isGroup && !isCallCenter && !isMpa) return error("Forbidden", 403);

  // Stored recording, else lazily recover it from ElevenLabs by conversation id.
  const audioPath = await ensureRecording(session);
  if (!audioPath) return error("No recording for this session", 404);

  const buffer = await downloadRecording(audioPath);
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
