import { z } from "zod";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { error, json } from "@/lib/api";

const Body = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
});

// POST /api/auth/accept-invite — finalize an invited account: the password is
// set via the Supabase client; this records the name and flips status to ACTIVE.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return error("Unauthorized", 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Name is required", 422);

  await prisma.user.update({
    where: { id: authUser.id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      status: "ACTIVE",
    },
  });

  return json({ ok: true });
}
