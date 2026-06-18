import { prisma } from "@/lib/db";
import { sendAssessmentInvite } from "@/lib/email";
import { ASSESSMENT_COOLDOWN_DAYS } from "@/lib/audit";

// Bimonthly prospect re-engagement sweep. For each prospect practice whose last
// assessment is past the 2-month cooldown (and that hasn't converted to a paid
// account), email an invite to run another free one. One per practice domain.
// Idempotent via lastInviteAt; safe to run more often than bimonthly.
export async function sweepAssessmentInvites(origin: string, dryRun = false): Promise<{ due: number; sent: number; domains: string[] }> {
  const cutoff = new Date(Date.now() - ASSESSMENT_COOLDOWN_DAYS * 86400_000);
  const rows = await prisma.setterAudit.findMany({
    where: {
      status: "SCORED",
      emailVerified: true,
      createdAt: { lte: cutoff },
      office: { isProspect: true },
      OR: [{ lastInviteAt: null }, { lastInviteAt: { lte: cutoff } }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, emailDomain: true, practiceName: true },
  });

  const seen = new Set<string>();
  const due = rows.filter((r) => (seen.has(r.emailDomain) ? false : (seen.add(r.emailDomain), true)));

  let sent = 0;
  if (!dryRun) {
    for (const r of due) {
      const ok = await sendAssessmentInvite({ to: r.email, practiceName: r.practiceName, link: `${origin}/audit` });
      if (ok) {
        await prisma.setterAudit.update({ where: { id: r.id }, data: { lastInviteAt: new Date() } });
        sent++;
      }
    }
  }
  return { due: due.length, sent, domains: due.map((d) => d.emailDomain) };
}
