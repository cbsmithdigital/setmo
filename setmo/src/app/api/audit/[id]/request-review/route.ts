import { json } from "@/lib/api";

// POST /api/audit/:id/request-review — retired. Verifying a personal email
// already alerts the team (see verify/route.ts), and the review queue lives at
// /platform/assessments. Kept as a no-op so a page opened before the change
// doesn't error; it sends nothing, so it can't be used to flood the alert inbox.
export async function POST() {
  return json({ ok: true });
}
