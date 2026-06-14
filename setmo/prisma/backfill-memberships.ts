// Backfill a Membership for every user from their current role, and grant the
// demo setter (Sam) a second OFFICE_ADMIN role so the role switcher is
// demoable. Idempotent. Run: pnpm exec tsx prisma/backfill-memberships.ts
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

function scopeFor(role: string, officeId: string | null, organizationId: string | null) {
  if (role === "GROUP_ADMIN") return { scopeType: "GROUP" as const, scopeId: organizationId };
  if (role === "PLATFORM_ADMIN" || role === "DISTRIBUTOR" || role === "CONSULTANT")
    return { scopeType: "PLATFORM" as const, scopeId: null };
  return { scopeType: "OFFICE" as const, scopeId: officeId };
}

async function grant(userId: string, role: string, officeId: string | null, organizationId: string | null) {
  const { scopeType, scopeId } = scopeFor(role, officeId, organizationId);
  const existing = await prisma.membership.findFirst({ where: { userId, role: role as never, scopeId } });
  if (existing) return false;
  await prisma.membership.create({ data: { userId, role: role as never, scopeType, scopeId } });
  return true;
}

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, role: true, officeId: true, organizationId: true, email: true } });
  let created = 0;
  for (const u of users) {
    if (await grant(u.id, u.role, u.officeId, u.organizationId)) created++;
  }

  // Demo: Sam wears multiple hats — setter, office admin, and DSO lead — so one
  // login can demo all three role views + the role switcher.
  const sam = await prisma.user.findFirst({ where: { email: "sam@brightworkdental.com" } });
  let samRoles = 0;
  if (sam?.officeId && (await grant(sam.id, "OFFICE_ADMIN", sam.officeId, sam.organizationId))) samRoles++;
  if (sam?.organizationId && (await grant(sam.id, "GROUP_ADMIN", sam.officeId, sam.organizationId))) samRoles++;

  console.log(`✅ Backfilled ${created} primary membership(s) across ${users.length} users.`);
  console.log(`✅ Granted Sam ${samRoles} new role(s). Sam now holds Setter + Office Admin + Group/DSO.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
