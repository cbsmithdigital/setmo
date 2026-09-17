import { prisma } from "@/lib/db";
import type { ServiceKey } from "@/generated/prisma/client";

// Which call types a new practice starts with. Every office-creation path goes
// through here, so a new account never lands on a practice page where every card
// says "Soon". Services whose agent isn't live yet can still be turned on in the
// catalog — they show as "Soon" and start working the day the agent goes live.
//
// v1 seeds the implant call. As each new service pack ships this grows a
// practice-type map (general practice → new patient + recall, etc.).
const DEFAULT_SERVICES: ServiceKey[] = ["IMPLANT"];

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
