// Enable Row-Level Security on every table in the public schema.
//
// SetMo uses Supabase ONLY for auth and reaches all data through Prisma as the
// `postgres` owner role, which bypasses RLS. Enabling RLS (with no policies)
// therefore locks the public anon Data API out of our tables without affecting
// the app. New Prisma migrations create tables with RLS OFF by default, so
// re-run this after `pnpm db:push` to keep Supabase's security advisor happy.
//
//   pnpm exec tsx prisma/enable-rls.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { prisma } from "@/lib/db";

async function main() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  );
  for (const t of tables) {
    await prisma.$executeRawUnsafe(`ALTER TABLE public."${t.tablename}" ENABLE ROW LEVEL SECURITY;`);
  }
  const off = await prisma.$queryRawUnsafe<{ relname: string }[]>(
    `SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false`,
  );
  console.log(`RLS enabled on ${tables.length} tables. Still off: ${off.length ? off.map((o) => o.relname).join(", ") : "none ✓"}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
