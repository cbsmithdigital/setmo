import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { kickOverdueScore } from "@/lib/rescore";
import { error, json } from "@/lib/api";

// GET /api/sessions/:id/result — the scored breakdown, 202 while the post-call
// webhook is still processing (the wrap screen polls this), or "failed" once
// the call has been given up on (never scored, or no transcript ever came).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const { id } = await params;
  const result = await getSessionResult(id, user);
  if (result) return json({ status: "scored", result });

  // Not scored yet. The setter waiting on their own call learns if it failed,
  // and an overdue score gets another try while they wait.
  const own = await prisma.session.findFirst({ where: { id, setterId: user.id }, select: { status: true, personaSeed: true } });
  if (own?.status === "FAILED") {
    const reason = ((own.personaSeed ?? {}) as Record<string, unknown>).failReason ?? "scoring";
    return json({ status: "failed", reason });
  }
  if (own) await kickOverdueScore(id);
  return json({ status: "pending" }, 202);
}
