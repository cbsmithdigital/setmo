import { prisma } from "@/lib/db";
import type { AnalyticsRange } from "@/lib/queries";
import { callShowRate, CASE_ACCEPTANCE, DEFAULT_CASE_VALUE, DEFAULT_MONTHLY_LEADS } from "@/lib/audit";

// The outcomes / ROI tie-in. The unique SetMo signal — set rate + show rate — is
// always derived from practice calls. The downstream funnel (leads → consults →
// cases → production) is PROJECTED from that signal, and any real number the
// office enters for a month OVERRIDES its projection (and flows downstream).

export type OutcomeSource = "reported" | "projected";
export type FunnelField = { value: number; source: OutcomeSource };

export function monthRangeOf(periodLabel: string): AnalyticsRange {
  const [y, m] = periodLabel.split("-").map(Number);
  return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1, 0, 0, 0, -1) };
}

// Map a chart timeframe key to the month the outcomes funnel should report on.
// Outcomes are inherently monthly; non-month windows fall back to the current month.
export function periodForRangeKey(key: string): { label: string; name: string } {
  const d = new Date();
  if (key === "lastmonth") d.setMonth(d.getMonth() - 1);
  return {
    label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    name: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
  };
}

// Practice booking signal over a window: set rate (scorer's booked flag on real
// calls) and modeled show rate (mean per-call show rate).
export async function practiceSignal(officeIds: string[], range: AnalyticsRange, setterId?: string) {
  const sessions = await prisma.session.findMany({
    where: {
      officeId: { in: officeIds },
      ...(setterId ? { setterId } : {}),
      kind: "PRACTICE",
      status: "SCORED",
      durationSeconds: { gte: 60 },
      startedAt: { gte: range.from, lte: range.to },
      evaluation: { isNot: null },
    },
    include: { evaluation: { include: { skills: true } } },
  });
  const real = sessions.filter((s) => s.evaluation!.skills.length > 0 && s.evaluation!.overallScore != null);
  const booked = real.filter((s) => s.evaluation!.booked === true).length;
  const setRate = real.length ? booked / real.length : 0;
  const showRates = real.map((s) => callShowRate(s.evaluation!.skills.map((k) => ({ skillKey: k.skillKey, score: Number(k.score) }))));
  const showRate = showRates.length ? showRates.reduce((a, b) => a + b, 0) / showRates.length / 100 : 0;
  return { sessions: real.length, setRate, showRate };
}

type Reported = { monthlyLeads: number | null; consultsBooked: number | null; casesStarted: number | null; production: number | null; note: string | null } | null;

function buildFunnel(sig: { sessions: number; setRate: number; showRate: number }, reported: Reported) {
  const caseValue = DEFAULT_CASE_VALUE;
  const src = (v: number | null | undefined): OutcomeSource => (v != null ? "reported" : "projected");

  const leadsV = reported?.monthlyLeads ?? DEFAULT_MONTHLY_LEADS;
  const consultsV = reported?.consultsBooked ?? Math.round(leadsV * sig.setRate);
  const casesV = reported?.casesStarted ?? Math.round(consultsV * sig.showRate * CASE_ACCEPTANCE);
  const productionV = reported?.production ?? casesV * caseValue;

  return {
    sessions: sig.sessions,
    setRatePct: Math.round(sig.setRate * 100),
    showRatePct: Math.round(sig.showRate * 100),
    leads: { value: leadsV, source: src(reported?.monthlyLeads) } as FunnelField,
    consults: { value: consultsV, source: src(reported?.consultsBooked) } as FunnelField,
    cases: { value: casesV, source: src(reported?.casesStarted) } as FunnelField,
    production: { value: productionV, source: src(reported?.production) } as FunnelField,
    caseValue,
    anyReported: !!(reported && (reported.monthlyLeads != null || reported.consultsBooked != null || reported.casesStarted != null || reported.production != null)),
    note: reported?.note ?? null,
  };
}

export type OfficeFunnel = ReturnType<typeof buildFunnel>;

export async function getOfficeOutcomeFunnel(officeId: string, periodLabel: string): Promise<OfficeFunnel> {
  const range = monthRangeOf(periodLabel);
  const [sig, reported] = await Promise.all([
    practiceSignal([officeId], range),
    prisma.officeOutcome.findUnique({ where: { officeId_periodLabel: { officeId, periodLabel } } }),
  ]);
  return buildFunnel(sig, reported);
}

// Per-location outcomes for a group + portfolio totals. Scoped to `officeIds`
// (a Multi Practice Admin's subset) when given, else the whole org.
export async function getGroupOutcomes(orgId: string, periodLabel: string, officeIds?: string[]) {
  const offices = await prisma.office.findMany({ where: { organizationId: orgId, ...(officeIds ? { id: { in: officeIds } } : {}) }, select: { id: true, name: true, city: true } });
  const range = monthRangeOf(periodLabel);
  const rows = await Promise.all(
    offices.map(async (o) => {
      const [sig, reported] = await Promise.all([
        practiceSignal([o.id], range),
        prisma.officeOutcome.findUnique({ where: { officeId_periodLabel: { officeId: o.id, periodLabel } } }),
      ]);
      return { id: o.id, name: o.name, city: o.city, ...buildFunnel(sig, reported) };
    })
  );
  const active = rows.filter((r) => r.sessions > 0).sort((a, b) => b.production.value - a.production.value);
  const totSess = active.reduce((a, r) => a + r.sessions, 0) || 1;
  return {
    rows: active,
    totalProduction: active.reduce((a, r) => a + r.production.value, 0),
    totalCases: active.reduce((a, r) => a + r.cases.value, 0),
    totalConsults: active.reduce((a, r) => a + r.consults.value, 0),
    setRatePct: Math.round(active.reduce((a, r) => a + r.setRatePct * r.sessions, 0) / totSess),
    showRatePct: Math.round(active.reduce((a, r) => a + r.showRatePct * r.sessions, 0) / totSess),
    reportedCount: active.filter((r) => r.anyReported).length,
    locationCount: active.length,
  };
}
