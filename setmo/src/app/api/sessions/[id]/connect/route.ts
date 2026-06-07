import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { agentIdFor, getSignedUrl, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { error, json } from "@/lib/api";
import type { ServiceKey } from "@/generated/prisma/client";

// POST /api/sessions/:id/connect — server bootstrap: mint a fresh signed URL
// and the dynamic-variable overrides the agent role-plays with. Returns the
// config for the browser SDK to start the conversation.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const { id } = await params;
  const session = await prisma.session.findFirst({
    where: { id, setterId: user.id },
  });
  if (!session) return error("Session not found", 404);

  const office = user.office;
  const memory = await prisma.setterMemory.findUnique({ where: { setterId: user.id } });
  const enabledServices = (office?.services ?? [])
    .filter((s) => s.enabled)
    .map((s) => s.serviceType)
    .join(", ");

  // Server-built overrides (the office + setter context the agent role-plays with).
  const dynamicVariables: Record<string, string> = {
    session_id: session.id,
    setter_id: user.id,
    setter_first_name: user.firstName ?? "",
    office_name: office?.name ?? "",
    office_city: office?.city ?? "",
    offer_framing: office?.offerFraming ?? "",
    appointment_framing: office?.appointmentFraming ?? "",
    deposit_policy: office?.depositPolicy ?? "",
    allowed_services: enabledServices,
    memory_summary: memory?.summary ?? "",
    difficulty: session.difficulty,
  };

  await prisma.session.update({
    where: { id: session.id },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });

  if (!isElevenLabsConfigured()) {
    return json({ configured: false, dynamicVariables });
  }

  const agentId = agentIdFor(session.serviceType as ServiceKey);
  if (!agentId) {
    return json({ configured: false, dynamicVariables, reason: "agent id not set" });
  }

  try {
    const signedUrl = await getSignedUrl(agentId);
    return json({ configured: true, signedUrl, dynamicVariables, setterId: user.id });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Failed to start conversation", 502);
  }
}
