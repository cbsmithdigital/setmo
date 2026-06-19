import { z } from "zod";
import { loadAuditByCookie } from "@/lib/audit-auth";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { provisionAccount } from "@/lib/provision";
import { error, json } from "@/lib/api";

const Body = z.object({ password: z.string().min(8).max(200) });

// POST /api/audit/[id]/claim — convert a completed assessment into a real,
// billable practice account. Gated by the audit's access cookie.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminConfigured()) return error("Signup isn't configured yet", 503);
  const { id } = await params;
  const audit = await loadAuditByCookie(id);
  if (!audit) return error("This assessment link has expired — start a new one.", 403);
  if (audit.status !== "SCORED") return error("Finish your assessment first.", 409);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Choose a password (8+ characters).", 422);

  const res = await provisionAccount({
    kind: "practice",
    practiceName: audit.practiceName,
    contactName: audit.contactName,
    email: audit.email,
    password: parsed.data.password,
    claimOfficeId: audit.officeId, // flip the prospect office to a real account
  });
  if (!res.ok) return error(res.error, res.code);
  return json({ ok: true, email: audit.email });
}
