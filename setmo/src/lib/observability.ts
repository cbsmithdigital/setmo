import * as Sentry from "@sentry/nextjs";

/**
 * Report a server-side error. Always logs (so failures are visible in Vercel
 * logs even without Sentry) and forwards to Sentry when configured. Never throws
 * — monitoring must not break the request/background path it's called from.
 * `context.scope` is a short label for where it happened (e.g. "stripe-webhook").
 */
export function captureError(err: unknown, context?: Record<string, unknown>) {
  const scope = (context?.scope as string) ?? "error";
  console.error(`[setmo:${scope}]`, err, context ?? {});
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* swallow — never let monitoring throw */
  }
}
