import { loadAuditByCookie } from "@/lib/audit-auth";
import { createAuditCheckout, isStripeConfigured } from "@/lib/stripe";
import { error, json } from "@/lib/api";

// POST /api/audit/:id/pay — pay $50 to unlock an additional audit immediately
// (the self-serve alternative to manual approval for free-email/duplicate cases).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditByCookie(id);
  if (!audit) return error("Unauthorized", 401);
  if (audit.status === "ACTIVE" || audit.status === "SCORED") {
    return error("This audit is already unlocked.", 409);
  }
  if (!isStripeConfigured()) return error("Payments aren't configured yet.", 503);

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    const url = await createAuditCheckout({
      auditId: id,
      customerEmail: audit.email,
      practiceName: audit.practiceName,
      origin,
    });
    return json({ url });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't start checkout", 502);
  }
}
