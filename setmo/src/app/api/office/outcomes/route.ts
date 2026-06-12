import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, isManagerRole, getActiveRole } from "@/lib/auth";
import { error, json } from "@/lib/api";

const Body = z.object({
  periodLabel: z.string().regex(/^\d{4}-\d{2}$/),
  consultsBooked: z.number().int().min(0).nullable().optional(),
  casesStarted: z.number().int().min(0).nullable().optional(),
  production: z.number().int().min(0).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

// POST /api/office/outcomes — log this practice's real-world results for a month.
// Collected now so training→outcome reporting becomes possible later.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!isManagerRole(getActiveRole(user)) || !user.officeId) return error("Forbidden", 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { periodLabel, consultsBooked, casesStarted, production, note } = parsed.data;

  const data = {
    consultsBooked: consultsBooked ?? null,
    casesStarted: casesStarted ?? null,
    production: production ?? null,
    note: note?.trim() || null,
    createdById: user.id,
  };

  const outcome = await prisma.officeOutcome.upsert({
    where: { officeId_periodLabel: { officeId: user.officeId, periodLabel } },
    create: { officeId: user.officeId, periodLabel, ...data },
    update: data,
  });
  return json({ ok: true, outcome });
}
