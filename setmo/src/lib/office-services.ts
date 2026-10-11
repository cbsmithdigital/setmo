import { prisma } from "@/lib/db";
import type { ServiceKey } from "@/generated/prisma/client";

// Which call types a new practice starts with. Every office-creation path goes
// through here, so a new account never lands on a practice page where every card
// says "Soon". Services whose agent isn't live yet can still be turned on in the
// catalog — they show as "Soon" and start working the day the agent goes live.
//
// Every call type with a pack is on by default; an office admin turns off the
// ones their practice doesn't do in the catalog.
const DEFAULT_SERVICES: ServiceKey[] = ["IMPLANT", "DENTURE", "COSMETIC", "ORTHO", "WISDOM", "GENERAL"];

export async function seedOfficeServices(
  officeId: string,
  opts: { services?: ServiceKey[] } = {}
): Promise<void> {
  const keys = opts.services?.length ? opts.services : DEFAULT_SERVICES;
  await prisma.officeService.createMany({
    data: keys.map((serviceType) => ({ officeId, serviceType, enabled: true })),
    skipDuplicates: true,
  });
}

/** Default lead-facing offer wording for a practice with no offer set yet.
 *  Deliberately service-neutral — a call center's served practices are not all
 *  implant practices, and implant wording in a general office's lead prompt is
 *  what made those calls sound wrong. */
export function defaultOfferFraming(practiceName: string): string {
  return `${practiceName}: free new-patient consultation, financing available.`;
}
