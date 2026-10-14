/**
 * Cron routes run only for Vercel's scheduler, which sends `Authorization:
 * Bearer $CRON_SECRET`. They move money and send mail, so with no secret
 * configured they refuse everyone rather than run for anyone.
 */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}
