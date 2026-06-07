import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAllowance } from "@/lib/queries";
import { SERVICE_META } from "@/lib/service-meta";
import { LiveSession } from "@/components/LiveSession";
import type { ServiceKey } from "@/generated/prisma/client";

// The signature live-session screen — full-bleed (no sidebar).
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const session = await prisma.session.findFirst({
    where: { id, setterId: user.id },
  });
  if (!session) notFound();

  const allowance = await getAllowance(session.officeId);

  return (
    <LiveSession
      sessionId={session.id}
      serviceLabel={SERVICE_META[session.serviceType as ServiceKey].name}
      remainingMinutes={allowance.remainingSeconds / 60}
    />
  );
}
