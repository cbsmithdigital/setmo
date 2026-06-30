import * as Sentry from "@sentry/nextjs";

// Server-side error monitoring. No-op until SENTRY_DSN is set (so local/dev and
// any environment without the DSN run untouched). Errors-only — tracesSampleRate
// 0 keeps it free of performance-tracing overhead.
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    });
  }
}

// Captures errors thrown inside Server Components, Route Handlers, and proxy.
export const onRequestError = Sentry.captureRequestError;
