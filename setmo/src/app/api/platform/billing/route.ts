import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { createRecurringBillingCheckout, createBillingPortalSession, isStripeConfigured } from "@/lib/stripe";
import { error, json } from "@/lib/api";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setup_recurring"),
    officeId: z.string().min(1),
    accessCents: z.number().int().min(0).max(1_000_000),
    usageCents: z.number().int().min(0).max(1_000_000),
    usageMinutes: z.number().int().min(1).max(100_000),
  }),
  z.object({ action: z.literal("portal"), officeId: z.string().min(1) }),
]);

// POST /api/platform/billing — super-admin billing for a single LOCATION.
//  • setup_recurring → a Stripe Checkout that saves the card + starts a monthly
//    subscription (tax-inclusive access + usage), granting a fixed minute
//    allowance each cycle. The super-admin completes it (enters the card).
//  • portal → the Stripe billing portal to update/replace the card.
// Runs in production (where the Stripe keys live). No card data ever touches us.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  if (!isStripeConfigured()) return error("Stripe isn't configured.", 400);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { officeId } = parsed.data;

  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { id: true, name: true, organizationId: true, stripeCustomerId: true },
  });
  if (!office) return error("Location not found", 404);
  const returnPath = `/platform/accounts/${office.organizationId ?? office.id}`;
  const origin = new URL(req.url).origin;

  if (parsed.data.action === "portal") {
    if (!office.stripeCustomerId) return error("No card on file yet — set up billing first.", 409);
    const url = await createBillingPortalSession({ customerId: office.stripeCustomerId, returnUrl: `${origin}${returnPath}` });
    return json({ url });
  }

  // setup_recurring
  const admin = await prisma.user.findFirst({
    where: { officeId, role: "OFFICE_ADMIN" },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });
  const url = await createRecurringBillingCheckout({
    officeId,
    accessCents: parsed.data.accessCents,
    usageCents: parsed.data.usageCents,
    usageMinutes: parsed.data.usageMinutes,
    stripeCustomerId: office.stripeCustomerId,
    customerEmail: admin?.email,
    returnUrl: `${origin}${returnPath}`,
  });
  await logAdminAction(actor, {
    action: "billing.setup_recurring",
    summary: `Started recurring billing for ${office.name} — $${((parsed.data.accessCents + parsed.data.usageCents) / 100).toFixed(2)}/mo, ${parsed.data.usageMinutes} min/cycle`,
    targetType: "office",
    targetId: officeId,
    detail: { accessCents: parsed.data.accessCents, usageCents: parsed.data.usageCents, usageMinutes: parsed.data.usageMinutes },
  });
  return json({ url });
}
