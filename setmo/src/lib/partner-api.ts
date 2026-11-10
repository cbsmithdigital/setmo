import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { seedOfficeServices, defaultOfferFraming } from "@/lib/office-services";
import type { PartnerMode, ServiceKey } from "@/generated/prisma/client";

// ===========================================================================
// PARTNER API — the server-to-server integration a partner like Team Care uses
// to run SetMo practice calls inside its own app. This file holds the pieces
// the API routes (/api/v1), the embedded call and the platform console share:
// keys, per-mode settings, and the partner's own ids for its locations and
// trainees.
// ===========================================================================

export const ALL_CALL_TYPES: ServiceKey[] = ["IMPLANT", "DENTURE", "COSMETIC", "ORTHO", "WISDOM", "GENERAL"];

const KEY_PREFIX: Record<PartnerMode, string> = { LIVE: "setmo_live_", TEST: "setmo_test_" };

/** sha256 of a secret — all we keep of keys and tokens. */
export const hashSecret = (s: string) => createHash("sha256").update(s).digest("hex");

/** A URL-safe random secret. */
export const randomSecret = (bytes = 24) => randomBytes(bytes).toString("base64url");

export const modeLabel = (m: PartnerMode) => (m === "LIVE" ? "live" : "test");

// ---------- keys ----------

/** Make a new key. The whole key is returned this once; only its hash is kept. */
export async function createApiKey(opts: { partnerId: string; mode: PartnerMode; label?: string | null; createdById?: string | null }) {
  const key = KEY_PREFIX[opts.mode] + randomSecret(24);
  const record = await prisma.partnerApiKey.create({
    data: {
      partnerId: opts.partnerId,
      mode: opts.mode,
      label: opts.label?.trim() || null,
      prefix: key.slice(0, KEY_PREFIX[opts.mode].length + 4),
      keyHash: hashSecret(key),
      createdById: opts.createdById ?? null,
    },
  });
  // A partner with a key has somewhere to send results and a secret to sign them.
  await ensureIntegration(opts.partnerId, opts.mode);
  return { key, record };
}

export async function revokeApiKey(partnerId: string, keyId: string): Promise<boolean> {
  const r = await prisma.partnerApiKey.updateMany({ where: { id: keyId, partnerId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count === 1;
}

export type ApiCaller = { partnerId: string; partnerName: string; mode: PartnerMode; keyId: string };

/** Who is calling the API, from `Authorization: Bearer setmo_…`. */
export async function authenticateApiKey(req: Request): Promise<{ ok: true; caller: ApiCaller } | { ok: false; status: number; code: string; message: string }> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  if (!key.startsWith("setmo_live_") && !key.startsWith("setmo_test_")) {
    return { ok: false, status: 401, code: "unauthorized", message: "Send your SetMo API key as `Authorization: Bearer setmo_live_…` (or setmo_test_…)." };
  }
  const record = await prisma.partnerApiKey.findUnique({
    where: { keyHash: hashSecret(key) },
    select: { id: true, mode: true, revokedAt: true, lastUsedAt: true, partner: { select: { id: true, name: true, status: true } } },
  });
  if (!record || record.revokedAt) return { ok: false, status: 401, code: "unauthorized", message: "That API key isn't valid. It may have been revoked." };
  if (record.partner.status !== "APPROVED") {
    return { ok: false, status: 403, code: "partner_disabled", message: "API access is switched off for this partner. Contact the SetMo team." };
  }
  // Note when the key was last used — at most every few minutes, not on every call.
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 5 * 60_000) {
    await prisma.partnerApiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { ok: true, caller: { partnerId: record.partner.id, partnerName: record.partner.name, mode: record.mode, keyId: record.id } };
}

// ---------- per-mode settings ----------

export async function ensureIntegration(partnerId: string, mode: PartnerMode) {
  const existing = await prisma.partnerIntegration.findUnique({ where: { partnerId_mode: { partnerId, mode } } });
  if (existing) return existing;
  try {
    return await prisma.partnerIntegration.create({ data: { partnerId, mode, webhookSecret: "whsec_" + randomSecret(24) } });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return prisma.partnerIntegration.findUniqueOrThrow({ where: { partnerId_mode: { partnerId, mode } } });
    throw e;
  }
}

export async function rotateWebhookSecret(partnerId: string, mode: PartnerMode) {
  await ensureIntegration(partnerId, mode);
  return prisma.partnerIntegration.update({ where: { partnerId_mode: { partnerId, mode } }, data: { webhookSecret: "whsec_" + randomSecret(24) } });
}

/** A site allowed to show the call in a frame: an https origin, or (test mode
 *  only) a localhost one for the partner's developers. Returns the normalized
 *  origin, or null if it isn't one. */
export function normalizeOrigin(raw: string, mode: PartnerMode): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol === "https:" && !local) return u.origin;
  if (mode === "TEST" && local && (u.protocol === "http:" || u.protocol === "https:")) return u.origin;
  return null;
}

/** Where results are sent: https only (a tunnel like ngrok works for local testing). */
export function normalizeWebhookUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname.endsWith(".local")) return null;
  return u.toString();
}

export const isAccentColor = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);

export async function updateIntegration(
  partnerId: string,
  mode: PartnerMode,
  input: { webhookUrl?: string | null; allowedOrigins?: string[]; accentColor?: string | null; backgroundColor?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const data: { webhookUrl?: string | null; allowedOrigins?: string[]; accentColor?: string | null; backgroundColor?: string | null } = {};
  if (input.webhookUrl !== undefined) {
    if (input.webhookUrl === null || input.webhookUrl.trim() === "") data.webhookUrl = null;
    else {
      const url = normalizeWebhookUrl(input.webhookUrl);
      if (!url) return { ok: false, error: "The webhook URL must be a public https address." };
      data.webhookUrl = url;
    }
  }
  if (input.allowedOrigins !== undefined) {
    const out: string[] = [];
    for (const raw of input.allowedOrigins.map((o) => o.trim()).filter(Boolean)) {
      const o = normalizeOrigin(raw, mode);
      if (!o) return { ok: false, error: `"${raw}" isn't a site address SetMo can allow${mode === "LIVE" ? " (live sites must be https)" : ""}.` };
      if (!out.includes(o)) out.push(o);
    }
    if (out.length > 10) return { ok: false, error: "Ten sites at most." };
    data.allowedOrigins = out;
  }
  if (input.accentColor !== undefined) {
    if (input.accentColor && !isAccentColor(input.accentColor)) return { ok: false, error: "The accent color must look like #2E7D6B." };
    data.accentColor = input.accentColor || null;
  }
  // The call screen's background: blank keeps SetMo's dark screen; a light color
  // switches the embed to a light palette (lib/embed-theme).
  if (input.backgroundColor !== undefined) {
    if (input.backgroundColor && !isAccentColor(input.backgroundColor)) return { ok: false, error: "The background color must look like #F4F7F9." };
    data.backgroundColor = input.backgroundColor || null;
  }
  await ensureIntegration(partnerId, mode);
  await prisma.partnerIntegration.update({ where: { partnerId_mode: { partnerId, mode } }, data });
  return { ok: true };
}

// ---------- the partner's own ids ----------

/** Serialize work on one of the partner's ids (two requests creating the same
 *  location at once must end up with one location). */
async function lockRef(tx: { $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<number> }, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export type LocationInput = {
  name?: string;
  city?: string | null;
  doctorName?: string | null;
  offer?: string | null;
  appointment?: string | null;
  deposit?: string | null;
  callTypes?: ServiceKey[];
};

const clean = (s: string | null | undefined, max: number) => (s == null ? s : s.trim().slice(0, max) || null);

/** Create or update one of the partner's locations (a SetMo office it runs). */
export async function upsertLocation(
  caller: { partnerId: string; mode: PartnerMode },
  externalId: string,
  input: LocationInput
): Promise<{ ok: true; officeId: string; created: boolean } | { ok: false; status: number; code: string; message: string }> {
  return prisma.$transaction(async (tx) => {
    await lockRef(tx, `partner-ref:${caller.partnerId}:${caller.mode}:LOCATION:${externalId}`);
    const ref = await tx.partnerRef.findUnique({
      where: { partnerId_mode_kind_externalId: { partnerId: caller.partnerId, mode: caller.mode, kind: "LOCATION", externalId } },
      select: { officeId: true },
    });
    const fields = {
      ...(input.name !== undefined ? { name: clean(input.name, 120) ?? undefined } : {}),
      ...(input.city !== undefined ? { city: clean(input.city, 80) } : {}),
      ...(input.doctorName !== undefined ? { doctorName: clean(input.doctorName, 80) } : {}),
      ...(input.offer !== undefined ? { offerFraming: clean(input.offer, 600) } : {}),
      ...(input.appointment !== undefined ? { appointmentFraming: clean(input.appointment, 600) } : {}),
      ...(input.deposit !== undefined ? { depositPolicy: clean(input.deposit, 600) } : {}),
    };

    let officeId: string;
    let created = false;
    if (ref?.officeId) {
      officeId = ref.officeId;
      if (Object.keys(fields).length) await tx.office.update({ where: { id: officeId }, data: fields });
    } else {
      const name = clean(input.name, 120);
      if (!name) return { ok: false as const, status: 422, code: "invalid_request", message: "A new location needs a name." };
      const office = await tx.office.create({
        data: {
          ...fields,
          name,
          offerFraming: fields.offerFraming ?? defaultOfferFraming(name),
          managedByPartnerId: caller.partnerId,
          // Test-mode locations are demo accounts: out of every business number.
          isDemo: caller.mode === "TEST",
        },
      });
      officeId = office.id;
      created = true;
      await tx.partnerRef.create({ data: { partnerId: caller.partnerId, mode: caller.mode, kind: "LOCATION", externalId, officeId } });
    }
    return { ok: true as const, officeId, created };
  }).then(async (r) => {
    if (!r.ok) return r;
    // Call types: every one is on for a new location unless the partner says which.
    if (r.created) await seedOfficeServices(r.officeId, { services: input.callTypes?.length ? input.callTypes : ALL_CALL_TYPES });
    else if (input.callTypes) await setLocationCallTypes(r.officeId, input.callTypes);
    return r;
  });
}

/** Turn exactly these call types on for a location (the rest off). */
export async function setLocationCallTypes(officeId: string, types: ServiceKey[]) {
  for (const t of ALL_CALL_TYPES) {
    const enabled = types.includes(t);
    await prisma.officeService.upsert({
      where: { officeId_serviceType: { officeId, serviceType: t } },
      create: { officeId, serviceType: t, enabled },
      update: { enabled },
    });
  }
}

export async function findLocation(caller: { partnerId: string; mode: PartnerMode }, externalId: string) {
  const ref = await prisma.partnerRef.findUnique({
    where: { partnerId_mode_kind_externalId: { partnerId: caller.partnerId, mode: caller.mode, kind: "LOCATION", externalId } },
    select: { officeId: true },
  });
  if (!ref?.officeId) return null;
  return prisma.office.findUnique({ where: { id: ref.officeId }, include: { services: true } });
}

export type TraineeInput = { firstName?: string | null; lastName?: string | null; locationExternalId?: string };

/** Create or update one of the partner's trainees: a SetMo setter with no login
 *  (made-up address, so no SetMo email ever reaches them) who belongs to one of
 *  the partner's locations. */
export async function upsertTrainee(
  caller: { partnerId: string; mode: PartnerMode },
  externalId: string,
  input: TraineeInput
): Promise<{ ok: true; userId: string; created: boolean } | { ok: false; status: number; code: string; message: string }> {
  let officeId: string | null = null;
  if (input.locationExternalId !== undefined) {
    const loc = await findLocation(caller, input.locationExternalId);
    if (!loc) return { ok: false, status: 404, code: "location_not_found", message: `No location with id "${input.locationExternalId}". Create it first (PUT /api/v1/locations/{id}), or send the location with the session.` };
    officeId = loc.id;
  }
  return prisma.$transaction(async (tx) => {
    await lockRef(tx, `partner-ref:${caller.partnerId}:${caller.mode}:TRAINEE:${externalId}`);
    const ref = await tx.partnerRef.findUnique({
      where: { partnerId_mode_kind_externalId: { partnerId: caller.partnerId, mode: caller.mode, kind: "TRAINEE", externalId } },
      select: { userId: true },
    });
    const names = {
      ...(input.firstName !== undefined ? { firstName: clean(input.firstName, 60) } : {}),
      ...(input.lastName !== undefined ? { lastName: clean(input.lastName, 60) } : {}),
    };
    if (ref?.userId) {
      await tx.user.update({ where: { id: ref.userId }, data: { ...names, ...(officeId ? { officeId } : {}) } });
      return { ok: true as const, userId: ref.userId, created: false };
    }
    if (!officeId) return { ok: false as const, status: 422, code: "invalid_request", message: "A new trainee needs a location." };
    const id = randomUUID();
    await tx.user.create({
      data: {
        id,
        email: `trainee-${id}@partner.setmo.invalid`,
        role: "SETTER",
        status: "ACTIVE",
        officeId,
        ...names,
      },
    });
    await tx.partnerRef.create({ data: { partnerId: caller.partnerId, mode: caller.mode, kind: "TRAINEE", externalId, userId: id } });
    return { ok: true as const, userId: id, created: true };
  });
}

export async function findTrainee(caller: { partnerId: string; mode: PartnerMode }, externalId: string) {
  const ref = await prisma.partnerRef.findUnique({
    where: { partnerId_mode_kind_externalId: { partnerId: caller.partnerId, mode: caller.mode, kind: "TRAINEE", externalId } },
    select: { userId: true },
  });
  if (!ref?.userId) return null;
  return prisma.user.findUnique({ where: { id: ref.userId }, select: { id: true, firstName: true, lastName: true, officeId: true, createdAt: true } });
}

/** The partner's own ids for a set of offices / users (for API responses). */
export async function externalIds(partnerId: string, mode: PartnerMode, ids: { officeIds?: string[]; userIds?: string[] }) {
  const refs = await prisma.partnerRef.findMany({
    where: {
      partnerId,
      mode,
      OR: [
        ...(ids.officeIds?.length ? [{ kind: "LOCATION" as const, officeId: { in: ids.officeIds } }] : []),
        ...(ids.userIds?.length ? [{ kind: "TRAINEE" as const, userId: { in: ids.userIds } }] : []),
      ],
    },
    select: { kind: true, externalId: true, officeId: true, userId: true },
  });
  const office = new Map<string, string>();
  const user = new Map<string, string>();
  for (const r of refs) {
    if (r.kind === "LOCATION" && r.officeId) office.set(r.officeId, r.externalId);
    if (r.kind === "TRAINEE" && r.userId) user.set(r.userId, r.externalId);
  }
  return { office, user };
}
