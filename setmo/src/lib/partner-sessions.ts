import { z } from "zod";
import { prisma } from "@/lib/db";
import { memoryForService } from "@/lib/memory";
import { checkPracticeOpen } from "@/lib/practice-access";
import { leadChoiceLabel, validateLeadChoice } from "@/lib/lead-choice";
import { ALL_CALL_TYPES, findLocation, upsertLocation, upsertTrainee, type ApiCaller } from "@/lib/partner-api";
import { mintLaunch } from "@/lib/partner-launch";
import { serializePartnerSession, type PartnerMeta } from "@/lib/partner-serialize";
import { EXTERNAL_ID } from "@/lib/partner-http";
import type { ServiceKey } from "@/generated/prisma/client";

// Creating a practice call through the Partner API. One request can carry the
// location and trainee (created or updated on the way), so the partner's app
// needs no setup calls before the first session.

const CallType = z.enum(ALL_CALL_TYPES as [ServiceKey, ...ServiceKey[]]);
const ExternalId = z.string().regex(EXTERNAL_ID, "use 1–100 letters, digits, or . _ : -");

export const LocationFields = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    city: z.string().max(80).nullable().optional(),
    doctor_name: z.string().max(80).nullable().optional(),
    offer: z.string().max(600).nullable().optional(),
    appointment: z.string().max(600).nullable().optional(),
    deposit: z.string().max(600).nullable().optional(),
    call_types: z.array(CallType).min(1).max(6).optional(),
  })
  .strict();

export const TraineeFields = z
  .object({
    first_name: z.string().trim().min(1).max(60).nullable().optional(),
    last_name: z.string().trim().max(60).nullable().optional(),
  })
  .strict();

export const locationInput = (l: z.infer<typeof LocationFields>) => ({
  name: l.name,
  city: l.city,
  doctorName: l.doctor_name,
  offer: l.offer,
  appointment: l.appointment,
  deposit: l.deposit,
  callTypes: l.call_types,
});

const Metadata = z
  .record(z.string().max(40), z.unknown())
  .refine((m) => JSON.stringify(m).length <= 2000, "metadata must be under 2 KB of JSON")
  .refine((m) => Object.keys(m).length <= 20, "metadata can have at most 20 keys");

export const CreateSessionBody = z
  .object({
    reference: ExternalId.optional(),
    location: LocationFields.extend({ id: ExternalId }),
    trainee: TraineeFields.extend({ id: ExternalId }),
    call_type: CallType,
    challenge: z.enum(["adaptive", "warm", "tough"]).default("adaptive"),
    lead: z
      .object({
        gender: z.enum(["male", "female"]).optional(),
        age: z.string().max(20).optional(),
        caller: z.string().max(20).optional(),
        concern: z.string().max(30).optional(),
      })
      .strict()
      .nullable()
      .optional(),
    metadata: Metadata.nullable().optional(),
  })
  .strict();

type Failure = { ok: false; status: number; code: string; message: string };
type Created = { ok: true; status: 200 | 201; body: Record<string, unknown> };

/** POST /api/v1/sessions. Idempotent on `reference`. */
export async function createPartnerSession(caller: ApiCaller, input: z.infer<typeof CreateSessionBody>): Promise<Created | Failure> {
  const scope = { partnerId: caller.partnerId, mode: caller.mode };

  // The same attempt sent twice (a retry after a timeout) gets the same call back.
  if (input.reference) {
    const replay = await existingByReference(caller, input);
    if (replay) return replay;
  }

  // Location: created or updated from what came with the request.
  const { id: locationId, ...locFields } = input.location;
  const locHasFields = Object.values(locFields).some((v) => v !== undefined);
  let officeId: string;
  if (locHasFields) {
    const loc = await upsertLocation(scope, locationId, locationInput(locFields));
    if (!loc.ok) return { ok: false, status: loc.status, code: loc.code, message: loc.message };
    officeId = loc.officeId;
  } else {
    const loc = await findLocation(scope, locationId);
    if (!loc) return { ok: false, status: 404, code: "location_not_found", message: `No location with id "${locationId}". Send its name with the session to create it.` };
    officeId = loc.id;
  }

  // Trainee: always placed at this location.
  const { id: traineeId, ...traineeFields } = input.trainee;
  const trainee = await upsertTrainee(scope, traineeId, {
    firstName: traineeFields.first_name,
    lastName: traineeFields.last_name,
    locationExternalId: locationId,
  });
  if (!trainee.ok) return { ok: false, status: trainee.status, code: trainee.code, message: trainee.message };

  // "Pick your lead": checked against what this call type can build.
  let choice: ReturnType<typeof validateLeadChoice>;
  try {
    choice = validateLeadChoice(input.call_type, input.lead ?? null);
  } catch (e) {
    return { ok: false, status: 422, code: "invalid_lead", message: e instanceof Error ? e.message : "That lead choice isn't valid." };
  }

  const access = await checkPracticeOpen({ officeId, serviceType: input.call_type, callCenterOrgId: null, partner: { id: caller.partnerId, mode: caller.mode } });
  if (!access.ok) {
    const messages: Record<string, string> = {
      call_type_unavailable: `${input.call_type} calls aren't available at this location. Turn the call type on for the location, or pick another.`,
      insufficient_tokens: "The practice token balance is used up, so new calls can't start until more tokens are added.",
      partner_disabled: "Practice calls are switched off for this partner. Contact the SetMo team.",
    };
    return { ok: false, status: access.code, code: access.reason, message: messages[access.reason] ?? access.error };
  }

  // Adaptive difficulty starts from this trainee's level on this call type.
  const difficulty = input.challenge.toUpperCase() as "ADAPTIVE" | "WARM" | "TOUGH";
  const memoryRow = await prisma.setterMemory.findUnique({ where: { setterId: trainee.userId } });
  const resolvedDifficulty = difficulty === "ADAPTIVE" ? memoryForService(memoryRow, input.call_type).difficultyFloor : difficulty;
  const meta: PartnerMeta = { metadata: (input.metadata ?? null) as Record<string, unknown> | null, createdAt: new Date().toISOString() };

  let sessionId: string;
  try {
    const s = await prisma.session.create({
      data: {
        setterId: trainee.userId,
        officeId,
        serviceType: input.call_type,
        agentId: access.agentId,
        difficulty,
        status: "CREATED",
        partnerId: caller.partnerId,
        partnerMode: caller.mode,
        partnerReference: input.reference ?? null,
        partnerMeta: meta as object,
        personaSeed: {
          resolvedDifficulty,
          hidden: true,
          ...(choice ? { choice, choiceLabel: leadChoiceLabel(input.call_type, choice) } : {}),
        },
      },
      select: { id: true },
    });
    sessionId = s.id;
  } catch (e) {
    // Two requests with the same reference at once: the other one won.
    if ((e as { code?: string })?.code === "P2002" && input.reference) {
      const replay = await existingByReference(caller, input);
      if (replay) return replay;
    }
    throw e;
  }

  const session = await serializePartnerSession(sessionId);
  const launch = await mintLaunch(sessionId, caller.partnerId);
  return { ok: true, status: 201, body: { ...session, launch } };
}

async function existingByReference(caller: ApiCaller, input: z.infer<typeof CreateSessionBody>): Promise<Created | Failure | null> {
  const existing = await prisma.session.findUnique({
    where: { partnerId_partnerMode_partnerReference: { partnerId: caller.partnerId, partnerMode: caller.mode, partnerReference: input.reference! } },
    select: { id: true, serviceType: true },
  });
  if (!existing) return null;
  const session = await serializePartnerSession(existing.id);
  if (!session) return null;
  if (existing.serviceType !== input.call_type || session.trainee.id !== input.trainee.id || session.location.id !== input.location.id) {
    return {
      ok: false,
      status: 409,
      code: "reference_conflict",
      message: `A session with reference "${input.reference}" already exists for a different trainee, location or call type.`,
    };
  }
  const launch = await mintLaunch(existing.id, caller.partnerId);
  return { ok: true, status: 200, body: { ...session, launch } };
}

/** A partner's session by SetMo id — only its own, in the key's mode. */
export async function partnerOwnsSession(caller: ApiCaller, sessionId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return false;
  const s = await prisma.session.findUnique({ where: { id: sessionId }, select: { partnerId: true, partnerMode: true } });
  return s?.partnerId === caller.partnerId && s.partnerMode === caller.mode;
}
