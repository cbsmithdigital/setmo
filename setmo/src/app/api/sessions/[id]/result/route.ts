import { getCurrentUser } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { error, json } from "@/lib/api";

// GET /api/sessions/:id/result — the scored breakdown, or 202 while the
// post-call webhook is still processing (the wrap screen polls this).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);

  const { id } = await params;
  const result = await getSessionResult(id, user.id);
  if (!result) return json({ status: "pending" }, 202);
  return json({ status: "scored", result });
}
