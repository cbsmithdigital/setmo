import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { error, json } from "@/lib/api";

const SERVICE_KEYS = ["IMPLANT", "DENTURE", "COSMETIC", "ORTHO", "WISDOM", "GENERAL"] as const;

const Body = z.object({
  profile: z.object({
    name: z.string().min(1).max(120),
    city: z.string().max(120).optional().default(""),
    offerFraming: z.string().max(300).optional().default(""),
    appointmentFraming: z.string().max(300).optional().default(""),
    depositPolicy: z.string().max(300).optional().default(""),
  }),
  services: z.record(z.enum(SERVICE_KEYS), z.boolean()),
});

// PUT /api/office/catalog — save offered services + the practice details the
// agent role-plays with. Only services with a LIVE agent can be enabled.
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role)) {
    return error("Only admins can edit the catalog", 403);
  }
  if (!user.officeId) return error("No office assigned", 400);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid catalog payload", 422);
  const { profile, services } = parsed.data;

  const liveAgents = new Set(
    (await prisma.agent.findMany({ where: { status: "LIVE" } })).map((a) => a.serviceType)
  );

  await prisma.$transaction(async (tx) => {
    await tx.office.update({
      where: { id: user.officeId! },
      data: {
        name: profile.name,
        city: profile.city,
        offerFraming: profile.offerFraming,
        appointmentFraming: profile.appointmentFraming,
        depositPolicy: profile.depositPolicy,
      },
    });

    for (const key of SERVICE_KEYS) {
      if (!(key in services)) continue;
      // Can't offer a service that has no live agent.
      const enabled = services[key] && liveAgents.has(key);
      await tx.officeService.upsert({
        where: { officeId_serviceType: { officeId: user.officeId!, serviceType: key } },
        update: { enabled },
        create: { officeId: user.officeId!, serviceType: key, enabled },
      });
    }
  });

  return json({ ok: true });
}
