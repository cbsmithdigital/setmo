import { prisma } from "@/lib/db";

// Minimum remaining time required to start a new session (no auto-overage).
const MIN_START_SECONDS = 60;

export async function currentPeriod(officeId: string) {
  return prisma.allowancePeriod.findFirst({
    where: { officeId },
    orderBy: { periodStart: "desc" },
  });
}

export function periodRemainingSeconds(p: {
  includedSeconds: bigint;
  bundleSeconds: bigint;
  consumedSeconds: bigint;
}) {
  return Number(p.includedSeconds) + Number(p.bundleSeconds) - Number(p.consumedSeconds);
}

/** Pre-session gate: is there enough pool to start? */
export async function canStartSession(officeId: string): Promise<{
  ok: boolean;
  remainingSeconds: number;
}> {
  const p = await currentPeriod(officeId);
  if (!p) return { ok: false, remainingSeconds: 0 };
  const remaining = periodRemainingSeconds(p);
  return { ok: remaining > MIN_START_SECONDS, remainingSeconds: Math.max(0, remaining) };
}

/** Draw down the pool by a session's duration (called server-side at score capture). */
export async function drawDownUsage(officeId: string, seconds: number): Promise<void> {
  const p = await currentPeriod(officeId);
  if (!p) return;
  await prisma.allowancePeriod.update({
    where: { id: p.id },
    data: { consumedSeconds: { increment: BigInt(Math.max(0, Math.round(seconds))) } },
  });
}
