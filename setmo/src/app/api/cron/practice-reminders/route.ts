import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api";
import { cronAuthorized } from "@/lib/cron-auth";
import { pushToUsers } from "@/lib/push";
import { getMinuteBalance } from "@/lib/usage";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
// No practice call in this long → a nudge; and never more often than this.
const QUIET_DAYS = 3;

const NUDGES = [
  { title: "Got 5 minutes?", body: "A quick practice call keeps your skills sharp — a new lead is ready when you are." },
  { title: "Your next lead is waiting", body: "One short practice call today makes the real ones easier. Tap to start." },
  { title: "Time for a rep?", body: "Pick a call type and a lead, and get scored in minutes." },
];

// GET /api/cron/practice-reminders — weekday mornings (US): a phone notification
// for setters who turned notifications on and haven't practiced in a few days.
// At most one every few days per person, and none when their practice has run
// out of tokens. Protected by CRON_SECRET (Vercel injects it).
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return error("Unauthorized", 401);

  const cutoff = new Date(Date.now() - QUIET_DAYS * DAY);
  const setters = await prisma.user.findMany({
    where: {
      role: "SETTER",
      status: "ACTIVE",
      pushSubscriptions: { some: {} },
      OR: [{ practiceReminderAt: null }, { practiceReminderAt: { lt: cutoff } }],
    },
    select: { id: true, officeId: true, callCenterPodId: true },
  });

  const nudge = NUDGES[Math.floor(Date.now() / DAY) % NUDGES.length];
  const balanceByOffice = new Map<string, number>();
  let sent = 0;
  for (const s of setters) {
    const last = await prisma.session.findFirst({
      where: { setterId: s.id, kind: "PRACTICE", isAudit: false },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    if (last && last.startedAt > cutoff) continue;

    // An office setter whose practice is out of tokens can't act on it.
    if (s.officeId && !s.callCenterPodId) {
      if (!balanceByOffice.has(s.officeId)) balanceByOffice.set(s.officeId, (await getMinuteBalance(s.officeId)).remainingMin);
      if ((balanceByOffice.get(s.officeId) ?? 0) <= 0) continue;
    }

    const r = await pushToUsers([s.id], { ...nudge, url: "/practice", tag: "practice-reminder" }, { ttlSeconds: 6 * 60 * 60 });
    if (r.sent > 0) {
      sent++;
      await prisma.user.update({ where: { id: s.id }, data: { practiceReminderAt: new Date() } });
    }
  }
  return json({ ok: true, considered: setters.length, sent });
}
