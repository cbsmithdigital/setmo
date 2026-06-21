// Grant internal console access to an email. The person must have signed in at
// least once (so a Supabase auth user exists). Run:
//   pnpm exec tsx prisma/grant-admin.ts you@email.com PLATFORM_ADMIN
//   pnpm exec tsx prisma/grant-admin.ts teammate@email.com SUPPORT
import { config } from "dotenv";
config({ path: ".env.local" });
import { prisma } from "@/lib/db";
import { getAdminClient } from "@/lib/supabase/admin";

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const role = (process.argv[3] || "PLATFORM_ADMIN").toUpperCase();
  if (!email || !["PLATFORM_ADMIN", "SUPPORT"].includes(role)) {
    console.log("Usage: tsx prisma/grant-admin.ts <email> <PLATFORM_ADMIN|SUPPORT>");
    return;
  }

  // Find the Supabase auth user by email.
  const admin = getAdminClient();
  let authId: string | null = null;
  for (let page = 1; page <= 10 && !authId; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) authId = u.id;
    if (data.users.length < 200) break;
  }
  if (!authId) {
    console.log(`No Supabase auth user for ${email}. Have them sign up / sign in once, then re-run.`);
    return;
  }

  const user = await prisma.user.upsert({
    where: { id: authId },
    update: { role: role as "PLATFORM_ADMIN" | "SUPPORT", status: "ACTIVE", officeId: null, organizationId: null },
    create: { id: authId, email, role: role as "PLATFORM_ADMIN" | "SUPPORT", status: "ACTIVE" },
  });
  await prisma.membership.upsert({
    where: { userId_role_scopeId: { userId: authId, role: role as "PLATFORM_ADMIN" | "SUPPORT", scopeId: "platform" } },
    update: {},
    create: { userId: authId, role: role as "PLATFORM_ADMIN" | "SUPPORT", scopeType: "PLATFORM", scopeId: "platform" },
  });
  console.log(`✅ ${email} is now ${role}. Sign in and go to /platform.`, user.id);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
