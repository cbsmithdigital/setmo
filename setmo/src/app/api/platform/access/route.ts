import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlatformActor } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { error, json } from "@/lib/api";

const Body = z.object({ officeId: z.string().min(1), action: z.enum(["activate", "pause"]) });

// POST /api/platform/access — pause or reinstate a location's Practice Access.
// "pause"    → revoke app access AND stop Stripe billing (pause invoice
//              collection — no future charges, fully reversible).
// "activate" → reinstate app access AND resume Stripe billing on the next cycle.
// Comp / never-paid accounts (no Stripe subscription) just flip the local status.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { officeId, action } = parsed.data;

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { name: true } });
  if (!office) return error("Location not found", 404);

  const sub = await prisma.subscription.findUnique({ where: { officeId }, select: { stripeSubscriptionId: true } });
  const subId = sub?.stripeSubscriptionId ?? null;

  let billing: "paused" | "resumed" | "none" = "none";
  let warning: string | null = null;

  if (subId && isStripeConfigured()) {
    const stripe = getStripe();
    try {
      if (action === "pause") {
        // Void collection: keeps the subscription alive but stops invoicing, so
        // billing halts immediately and can be resumed later without re-checkout.
        await stripe.subscriptions.update(subId, { pause_collection: { behavior: "void" } });
        billing = "paused";
      } else {
        const live = await stripe.subscriptions.retrieve(subId);
        if (live.status === "canceled") {
          // A fully-canceled Stripe sub can't be revived — the office must
          // re-activate from the billing page to start a fresh subscription.
          warning = "Stripe billing was fully canceled and can't be auto-resumed — access is on, but the practice must re-activate from their billing page to restart payments.";
        } else {
          await stripe.subscriptions.update(subId, { pause_collection: null });
          billing = "resumed";
        }
      }
    } catch (e) {
      warning = e instanceof Error ? e.message : "Stripe billing update failed — access status was changed, but verify billing in Stripe.";
    }
  }

  const status = action === "activate" ? "ACTIVE" : "CANCELED";
  await prisma.subscription.upsert({ where: { officeId }, update: { status }, create: { officeId, status } });
  await logAdminAction(actor, {
    action: `access.${action}`,
    summary: `${action === "activate" ? "Reinstated" : "Paused"} access for ${office.name}${billing !== "none" ? ` · Stripe billing ${billing}` : ""}`,
    targetType: "office",
    targetId: officeId,
    ...(warning ? { detail: { warning } } : {}),
  });
  return json({ ok: true, billing, warning });
}
