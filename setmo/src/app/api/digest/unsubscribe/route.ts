import { prisma } from "@/lib/db";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { json, error } from "@/lib/api";

// Token-signed, no login required. Reads u + t from the query string so the same
// URL works for both the footer link and Gmail's one-click List-Unsubscribe POST.
//   POST (default)            → unsubscribe
//   POST ?action=resubscribe  → re-enable weekly summaries
export async function POST(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const resubscribe = url.searchParams.get("action") === "resubscribe";
  if (!verifyUnsubscribe(userId, token)) return error("Invalid or expired unsubscribe link", 400);

  // Idempotent; updateMany so an already-deleted user is a harmless no-op.
  await prisma.user.updateMany({ where: { id: userId }, data: { digestOptOut: !resubscribe } });
  return json({ ok: true, optedOut: !resubscribe });
}
