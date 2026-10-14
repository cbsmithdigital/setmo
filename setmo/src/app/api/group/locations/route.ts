import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, getActiveRole } from "@/lib/auth";
import { seedOfficeServices } from "@/lib/office-services";
import { withinLimits, tooMany, DAY } from "@/lib/rate-limit";
import { error, json } from "@/lib/api";
import { inDemoAccount } from "@/lib/demo-shared";

const Body = z.object({
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().max(120).optional().nullable(),
});

// Plenty for any real group; stops a runaway script.
const MAX_LOCATIONS = 100;

// POST /api/group/locations — a group admin adds a location to their group. It
// starts with every call type on (like any new practice) and is activated and
// stocked with tokens from the Locations page. The group's partner referral
// covers it automatically (resolved office → group when commission accrues).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (getActiveRole(user) !== "GROUP_ADMIN" || !user.organizationId) return error("Only a group admin can add locations", 403);
  if (inDemoAccount(user)) return error("This is a demo account — locations are set up by the SetMo team.", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Give the location a name.", 422);

  const limit = await withinLimits([{ key: `add-location:${user.organizationId}`, limit: 20, windowSeconds: DAY }]);
  if (!limit.ok) return tooMany(limit.retryAfter, "That's a lot of new locations for one day — get in touch and we'll help set the rest up.");
  const count = await prisma.office.count({ where: { organizationId: user.organizationId } });
  if (count >= MAX_LOCATIONS) return error("Your group has reached the location limit — get in touch and we'll raise it.", 409);

  const office = await prisma.office.create({
    data: { name: parsed.data.name, city: parsed.data.city || null, organizationId: user.organizationId, isProspect: false },
    select: { id: true, name: true },
  });
  await seedOfficeServices(office.id);
  return json({ ok: true, office });
}
