import { z } from "zod";
import { getPlatformActor } from "@/lib/auth";
import { logAdminAction } from "@/lib/platform";
import { createAccountForOwner, extendTrial } from "@/lib/staff-accounts";
import { trialDateLabel } from "@/lib/trials";
import { error, json } from "@/lib/api";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    kind: z.enum(["practice", "group"]),
    practiceName: z.string().trim().min(2, "Give the practice a name.").max(160),
    city: z.string().trim().max(120).nullable().optional(),
    orgName: z.string().trim().max(160).nullable().optional(),
    ownerName: z.string().trim().min(2, "Enter the owner's name.").max(120),
    ownerEmail: z.string().trim().email("Enter the owner's email."),
    partnerId: z.string().nullable().optional(),
    trial: z.boolean().default(true),
  }),
  z.object({ action: z.literal("extend_trial"), accountId: z.string().min(1), days: z.number().int().min(1).max(60) }),
]);

// POST /api/platform/accounts — Platform staff (Super Admin or Success) set up
// an account for a practice or group: the owner gets a setup email, a 14-day
// free trial with a complimentary hour, and adds a card from Billing later.
// Also extends a trial.
export async function POST(req: Request) {
  const actor = await getPlatformActor();
  if (!actor) return error("Forbidden", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Check the form and try again.", 422);
  const b = parsed.data;

  if (b.action === "extend_trial") {
    const r = await extendTrial(b.accountId, b.days);
    if (!r.ok) return error(r.error, r.status);
    await logAdminAction(actor, { action: "account.trial", summary: `Extended ${r.name}'s free trial to ${trialDateLabel(r.endsAt)}`, targetType: "account", targetId: b.accountId, detail: { days: b.days, endsAt: r.endsAt.toISOString() } });
    return json({ ok: true, endsAt: r.endsAt.toISOString() });
  }

  if (b.kind === "group" && !b.orgName?.trim()) return error("Give the group a name.", 422);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const r = await createAccountForOwner({
    kind: b.kind,
    practiceName: b.practiceName,
    city: b.city ?? null,
    orgName: b.orgName ?? null,
    ownerName: b.ownerName,
    ownerEmail: b.ownerEmail,
    partnerId: b.partnerId || null,
    trial: b.trial,
    createdById: actor.id,
    origin,
  });
  if (!r.ok) return error(r.error, r.status);
  const name = b.kind === "group" ? b.orgName!.trim() : b.practiceName.trim();
  await logAdminAction(actor, {
    action: "account.create",
    summary: `Set up ${name} (${b.kind === "group" ? "group" : "practice"}) for ${b.ownerEmail.trim().toLowerCase()}${r.trialEndsAt ? ` — free trial until ${trialDateLabel(r.trialEndsAt)}` : ""}`,
    targetType: "account",
    targetId: r.accountId,
    detail: { kind: b.kind, owner: b.ownerEmail.trim().toLowerCase(), trial: b.trial, partnerId: b.partnerId ?? null, emailed: r.emailed },
  });
  return json({ ok: true, accountId: r.accountId, emailed: r.emailed, link: r.link });
}
