import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { REF_COOKIE } from "@/lib/referral-cookie";
import { loadAuditAccess } from "@/lib/audit";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { provisionAccount } from "@/lib/provision";
import { captureError } from "@/lib/observability";
import { error, json } from "@/lib/api";

const Body = z.object({ password: z.string().min(8).max(200), agree: z.literal(true) });

// POST /api/audit/[id]/claim — convert a completed assessment into a real,
// billable practice account. Gated by the audit's access cookie; the login it
// creates is the owner's (the audit's email), so it takes the owner's own
// token — a browser that came in on a setter link only holds that link's — and
// the Terms must be agreed to.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminConfigured()) return error("Signup isn't configured yet", 503);
  const { id } = await params;
  const audit = await loadAuditAccess(id);
  if (!audit) return error("This assessment link has expired — start a new one.", 403);
  if (audit.status !== "SCORED") return error("Finish your assessment first.", 409);
  if (audit.asSetter) {
    return error(`This link was shared with you to run the call. ${audit.contactName.split(/\s+/)[0] || "The practice owner"} can create the practice's account from the link in their own email.`, 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return error((body as { agree?: unknown } | null)?.agree === true ? "Choose a password (8+ characters)." : "Please agree to the Terms of Service and Privacy Policy to continue.", 422);
  }

  const res = await provisionAccount({
    kind: "practice",
    practiceName: audit.practiceName,
    contactName: audit.contactName,
    email: audit.email,
    password: parsed.data.password,
    claimOfficeId: audit.officeId, // flip the prospect office to a real account
    // A partner link followed since the audit credits it, if the audit had no partner.
    cookieReferralCode: (await cookies()).get(REF_COOKIE)?.value ?? null,
    termsAcceptedAt: new Date(),
  });
  if (!res.ok) return error(res.error, res.code, res.code === 409 ? { exists: true } : undefined);

  // The assessment's stand-in setter (it owns the baseline call, so it stays)
  // isn't a person: switch it off so it can't be invited or sign in.
  await prisma.user
    .updateMany({ where: { id: audit.prospectUserId, email: { endsWith: "@prospect.setmo" } }, data: { status: "DISABLED" } })
    .catch((e) => captureError(e, { scope: "audit-claim-standin", auditId: id }));
  return json({ ok: true, email: audit.email });
}
