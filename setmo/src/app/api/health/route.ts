import { json } from "@/lib/api";

// GET /api/health — deploy smoke check. Reports which integrations are wired
// (booleans only — never secret values). Also pings the database.
export async function GET() {
  const config = {
    database: Boolean(process.env.DATABASE_URL),
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_IMPLANT),
    elevenlabsWebhook: Boolean(process.env.ELEVENLABS_WEBHOOK_SECRET),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    resend: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
  };

  let database = false;
  try {
    const { prisma } = await import("@/lib/db");
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  const ok = config.database && config.supabase && database;
  return json({ ok, dbReachable: database, config }, ok ? 200 : 503);
}
