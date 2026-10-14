// Lock Supabase's public Data API out of every table in the public schema.
//
// SetMo uses Supabase for auth and storage only, and reaches all data through
// Prisma as the `postgres` owner role, which bypasses RLS and keeps its grants.
// The anon/authenticated roles (the key that ships in every page) need nothing
// here, so this:
//   1. turns RLS on (no policies) for every public table,
//   2. revokes the anon/authenticated grants on existing tables and sequences,
//   3. stops new tables from granting them anything by default.
// New Prisma tables otherwise arrive with RLS OFF and full anon grants, which
// is how push_subscription ended up readable. `pnpm db:push` runs this after
// every push; it is idempotent.
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
  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;`);
  await prisma.$executeRawUnsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;`);
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;`);
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;`);

  const off = await prisma.$queryRawUnsafe<{ relname: string }[]>(
    `SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false`,
  );
  const granted = await prisma.$queryRawUnsafe<{ relname: string }[]>(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r'
       AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
         OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))`,
  );
  console.log(`RLS enabled on ${tables.length} tables. Still off: ${off.length ? off.map((o) => o.relname).join(", ") : "none ✓"}`);
  console.log(`Public-key grants left: ${granted.length ? granted.map((g) => g.relname).join(", ") : "none ✓"}`);
  await prisma.$disconnect();
  if (off.length || granted.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
