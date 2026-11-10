import { z } from "zod";
import { getPlatformActor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/platform";
import { addPartnerTokens } from "@/lib/partner-wallet";
import { createApiKey, ensureIntegration, revokeApiKey, rotateWebhookSecret, updateIntegration, modeLabel } from "@/lib/partner-api";
import { error, json } from "@/lib/api";

const Mode = z.enum(["LIVE", "TEST"]);
const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("wallet.add"),
    mode: Mode,
    tokens: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= 10_000_000, "Tokens must be a whole number, not zero."),
    amountUsd: z.number().min(0).max(1_000_000).nullable().optional(),
    note: z.string().max(200).nullable().optional(),
  }),
  z.object({ action: z.literal("key.create"), mode: Mode, label: z.string().max(60).nullable().optional() }),
  z.object({ action: z.literal("key.revoke"), keyId: z.string().min(1) }),
  z.object({
    action: z.literal("settings.update"),
    mode: Mode,
    webhookUrl: z.string().max(500).nullable().optional(),
    allowedOrigins: z.array(z.string().max(200)).max(10).optional(),
    accentColor: z.string().max(7).nullable().optional(),
    backgroundColor: z.string().max(7).nullable().optional(),
  }),
  z.object({ action: z.literal("secret.reveal"), mode: Mode }),
  z.object({ action: z.literal("secret.rotate"), mode: Mode }),
  z.object({ action: z.literal("delivery.resend"), deliveryId: z.string().min(1) }),
]);

// POST /api/platform/partners/:id/integration — the Partner API console:
// wallet top-ups, API keys, webhook + framing settings, the webhook secret, and
// re-sending a webhook. Everything that moves money or hands out a secret is
// Super-Admin only; Support sees the page but can't act.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  if (actor.role !== "PLATFORM_ADMIN") return error("Super-Admin only", 403);
  const { id: partnerId } = await params;
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, name: true } });
  if (!partner) return error("Partner not found", 404);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid request", 422);
  const b = parsed.data;
  const log = (action: string, summary: string, detail?: Record<string, unknown>) =>
    logAdminAction(actor, { action, summary, targetType: "partner", targetId: partnerId, detail });

  switch (b.action) {
    case "wallet.add": {
      if (b.mode === "TEST" && b.amountUsd) return error("Test tokens are free — leave the amount empty.", 422);
      if (b.tokens % 10 !== 0) return error("Tokens come in steps of 10 (1 minute = 10 tokens).", 422);
      const entry = await addPartnerTokens({
        partnerId,
        mode: b.mode,
        tokens: b.tokens,
        amountCents: b.amountUsd != null ? Math.round(b.amountUsd * 100) : null,
        note: b.note ?? null,
        createdById: actor.id,
      });
      await log("partner.wallet", `${b.tokens > 0 ? "Added" : "Removed"} ${Math.abs(b.tokens).toLocaleString()} ${modeLabel(b.mode)} tokens ${b.tokens > 0 ? "to" : "from"} ${partner.name}'s wallet${b.amountUsd ? ` ($${b.amountUsd.toLocaleString()})` : ""}`, {
        mode: b.mode,
        tokens: b.tokens,
        amountUsd: b.amountUsd ?? null,
        note: b.note ?? null,
        entryId: entry.id,
      });
      return json({ ok: true });
    }
    case "key.create": {
      const { key, record } = await createApiKey({ partnerId, mode: b.mode, label: b.label ?? null, createdById: actor.id });
      await log("partner.key.create", `Created a ${modeLabel(b.mode)} API key for ${partner.name} (${record.prefix}…)`, { keyId: record.id, mode: b.mode });
      return json({ ok: true, key });
    }
    case "key.revoke": {
      const key = await prisma.partnerApiKey.findFirst({ where: { id: b.keyId, partnerId }, select: { prefix: true, mode: true } });
      if (!key) return error("Key not found", 404);
      await revokeApiKey(partnerId, b.keyId);
      await log("partner.key.revoke", `Revoked ${partner.name}'s ${modeLabel(key.mode)} API key ${key.prefix}…`, { keyId: b.keyId });
      return json({ ok: true });
    }
    case "settings.update": {
      const r = await updateIntegration(partnerId, b.mode, { webhookUrl: b.webhookUrl, allowedOrigins: b.allowedOrigins, accentColor: b.accentColor, backgroundColor: b.backgroundColor });
      if (!r.ok) return error(r.error, 422);
      await log("partner.settings", `Updated ${partner.name}'s ${modeLabel(b.mode)} API settings`, {
        mode: b.mode,
        webhookUrl: b.webhookUrl,
        allowedOrigins: b.allowedOrigins,
        accentColor: b.accentColor,
        backgroundColor: b.backgroundColor,
      });
      return json({ ok: true });
    }
    case "secret.reveal": {
      const integration = await ensureIntegration(partnerId, b.mode);
      await log("partner.secret.reveal", `Viewed ${partner.name}'s ${modeLabel(b.mode)} webhook secret`, { mode: b.mode });
      return json({ ok: true, secret: integration.webhookSecret });
    }
    case "secret.rotate": {
      const integration = await rotateWebhookSecret(partnerId, b.mode);
      await log("partner.secret.rotate", `Rotated ${partner.name}'s ${modeLabel(b.mode)} webhook secret`, { mode: b.mode });
      return json({ ok: true, secret: integration.webhookSecret });
    }
    case "delivery.resend": {
      const d = await prisma.partnerWebhookDelivery.findFirst({ where: { id: b.deliveryId, partnerId }, select: { id: true, type: true } });
      if (!d) return error("Event not found", 404);
      const { redeliver } = await import("@/lib/partner-webhooks");
      const r = await redeliver(d.id);
      await log("partner.webhook.resend", `Re-sent ${partner.name}'s ${d.type} event ${d.id}`, { deliveryId: d.id, delivered: r.delivered });
      return json({ ok: true, delivered: r.delivered, status: r.status ?? null, error: r.error ?? null });
    }
  }
}
