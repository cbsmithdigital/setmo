import { json, error } from "@/lib/api";
import { cronAuthorized } from "@/lib/cron-auth";
import { nudgeQuietSetters, remindPendingInvites, nudgeQuietTeams, sendGroupUpdates } from "@/lib/nudges";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/cron/nudges — weekday mornings (US): adoption nudges (lib/nudges) —
// quiet setters every 3 days, invite reminders on day 2 and 7, a weekly note
// to admins whose team hasn't practiced, and every 5 days an update to
// group/DSO admins on each of their practices. ?dryRun=1 lists who would be
// nudged without sending anything. Protected by CRON_SECRET (Vercel injects it).
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return error("Unauthorized", 401);
  const url = new URL(req.url);
  const opts = { origin: process.env.NEXT_PUBLIC_APP_URL ?? url.origin, dryRun: url.searchParams.get("dryRun") === "1" };

  const setters = await nudgeQuietSetters(opts);
  const invites = await remindPendingInvites(opts);
  const teams = await nudgeQuietTeams(opts);
  const groups = await sendGroupUpdates(opts);
  return json({
    ok: true,
    dryRun: opts.dryRun,
    setters: { considered: setters.considered, nudged: setters.nudged },
    invites: { considered: invites.considered, reminded: invites.reminded },
    teams: { considered: teams.considered, nudged: teams.nudged },
    groups: { considered: groups.considered, sent: groups.sent },
    ...(opts.dryRun ? { plan: { setters: setters.plan, invites: invites.plan, teams: teams.plan, groups: groups.plan } } : {}),
  });
}
