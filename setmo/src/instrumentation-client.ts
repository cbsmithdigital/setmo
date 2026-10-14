import * as Sentry from "@sentry/nextjs";
import { initBotId } from "botid/client/core";
import { BOT_CHECKED_ROUTES } from "@/lib/bot-routes";

// Client-side error monitoring. No-op until NEXT_PUBLIC_SENTRY_DSN is set.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  });
}

// Invisible bot check on the public forms that create accounts or send email.
// The browser attaches a challenge to these requests; the route verifies it.
initBotId({ protect: BOT_CHECKED_ROUTES });
