import { prisma } from "@/lib/db";
import { minuteQuote, type PricingConfig } from "@/lib/pricing";
import { getPricingConfig, getPlatformConfig } from "@/lib/config";
import { fullName } from "@/lib/format";

// Internal financials for the platform/super-admin console. Two framings drive
// everything (per the spec): (1) the same minute is COGS for a paying account but
// CAC for a prospect's free assessment; (2) sold minutes roll over, so cash margin
// (sold) and realized margin (consumed) are tracked separately.

export const MINUTE_COST_USD = 0.15; // variable cost per consumed minute

// ---- audit trail ----
export async function logAdminAction(
  actor: { id: string; email: string | null },
  entry: { action: string; summary: string; targetType?: string; targetId?: string; detail?: Record<string, unknown> },
) {
  await prisma.adminAuditLog.create({
    data: { actorId: actor.id, actorEmail: actor.email, action: entry.action, summary: entry.summary, targetType: entry.targetType, targetId: entry.targetId, detail: (entry.detail ?? undefined) as never },
  });
}

export async function getAuditLog(limit = 100) {
  return prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

const cashOf = (b: { amountCents: number | null; minutesPurchased: number }, cfg: PricingConfig) =>
  b.amountCents != null ? b.amountCents / 100 : minuteQuote(b.minutesPurchased, cfg).total; // estimate legacy/demo via pricing
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
const r2 = (n: number) => Math.round(n * 100) / 100;

type SessionLite = { officeId: string; durationSeconds: number | null; isAudit: boolean; startedAt: Date };

// Bucket a session's minutes into COGS / paid-assessment / prospect-CAC.
function bucketMinutes(sessions: SessionLite[], isProspect: (officeId: string) => boolean) {
  let payingSec = 0, paidAssessmentSec = 0, prospectSec = 0;
  for (const s of sessions) {
    const sec = s.durationSeconds ?? 0;
    if (isProspect(s.officeId)) prospectSec += sec;
    else if (s.isAudit) paidAssessmentSec += sec;
    else payingSec += sec;
  }
  return { payingMin: payingSec / 60, paidAssessmentMin: paidAssessmentSec / 60, prospectMin: prospectSec / 60 };
}

export async function getPlatformOverview() {
  const [offices, bundles, orgBundles, sessions, audits] = await Promise.all([
    prisma.office.findMany({ select: { id: true, organizationId: true, isProspect: true, subscription: { select: { status: true } } } }),
    prisma.conversationBundle.findMany({ select: { officeId: true, minutesPurchased: true, amountCents: true, purchasedAt: true } }),
    // Group/DSO coach-token purchases — a second token-revenue stream.
    prisma.orgTokenBundle.findMany({ select: { minutesPurchased: true, amountCents: true, purchasedAt: true } }),
    prisma.session.findMany({ where: { durationSeconds: { not: null }, kind: { not: "LIVE" } }, select: { officeId: true, durationSeconds: true, isAudit: true, startedAt: true } }),
    prisma.setterAudit.findMany({ select: { status: true, office: { select: { isProspect: true } } } }),
  ]);
  const cfg = await getPricingConfig();
  const orgCashOf = (b: { amountCents: number | null }) => (b.amountCents ?? 0) / 100;

  const prospect = new Set(offices.filter((o) => o.isProspect).map((o) => o.id));
  const isProspect = (id: string) => prospect.has(id);
  const realOffices = offices.filter((o) => !o.isProspect);
  const activeAccess = offices.filter((o) => o.subscription?.status === "ACTIVE").length;

  // accounts = organizations with ≥1 real office + standalone real offices
  const orgIdsWithReal = new Set(realOffices.filter((o) => o.organizationId).map((o) => o.organizationId!));
  const standalone = realOffices.filter((o) => !o.organizationId).length;
  const accounts = orgIdsWithReal.size + standalone;

  // Token revenue/minutes span both office pools and group/DSO coach wallets.
  const purchasedMin = bundles.reduce((a, b) => a + b.minutesPurchased, 0) + orgBundles.reduce((a, b) => a + b.minutesPurchased, 0);
  const cashRev = bundles.reduce((a, b) => a + cashOf(b, cfg), 0) + orgBundles.reduce((a, b) => a + orgCashOf(b), 0);
  const buckets = bucketMinutes(sessions, isProspect);

  const cogs = buckets.payingMin * MINUTE_COST_USD;
  const cac = buckets.prospectMin * MINUTE_COST_USD;
  const paidAssessmentCost = buckets.paidAssessmentMin * MINUTE_COST_USD;
  const outstandingMin = Math.max(0, purchasedMin - buckets.payingMin);
  const liability = outstandingMin * MINUTE_COST_USD;
  const blendedRate = purchasedMin > 0 ? cashRev / purchasedMin : 0;
  const realizedRev = buckets.payingMin * blendedRate;
  const accessMRR = activeAccess * cfg.accessMonthly;
  const minuteGrossMarginPct = realizedRev > 0 ? (realizedRev - cogs) / realizedRev : 0;

  // assessment funnel
  const taken = audits.length;
  const converted = audits.filter((a) => a.office && !a.office.isProspect).length;

  // monthly series — last 6 months
  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: monthLabel(d) });
  }
  const series = months.map((m) => {
    const mBundles = bundles.filter((b) => monthKey(b.purchasedAt) === m.key);
    const mOrgBundles = orgBundles.filter((b) => monthKey(b.purchasedAt) === m.key);
    const mSessions = sessions.filter((s) => monthKey(s.startedAt) === m.key);
    const b = bucketMinutes(mSessions, isProspect);
    return {
      label: m.label,
      cashRev: r2(mBundles.reduce((a, x) => a + cashOf(x, cfg), 0) + mOrgBundles.reduce((a, x) => a + orgCashOf(x), 0)),
      access: r2(accessMRR), // current run-rate (historical sub counts not tracked) — approximate
      cogs: r2(b.payingMin * MINUTE_COST_USD),
      cac: r2(b.prospectMin * MINUTE_COST_USD),
      paidAssessment: r2(b.paidAssessmentMin * MINUTE_COST_USD),
    };
  });

  return {
    accounts,
    locations: realOffices.length,
    prospects: prospect.size,
    activeAccess,
    accessMRR: r2(accessMRR),
    cashRev: r2(cashRev),
    realizedRev: r2(realizedRev),
    purchasedMin: Math.round(purchasedMin),
    consumedPayingMin: Math.round(buckets.payingMin),
    cogs: r2(cogs),
    cac: r2(cac),
    paidAssessmentCost: r2(paidAssessmentCost),
    outstandingMin: Math.round(outstandingMin),
    liability: r2(liability),
    minuteGrossMarginPct: Math.round(minuteGrossMarginPct * 100),
    blendedRate: r2(blendedRate),
    assessment: { taken, converted, rate: taken > 0 ? Math.round((converted / taken) * 100) : 0 },
    series,
  };
}

// ---- per-office stats (shared by directory + detail) ----
type OfficeStat = { id: string; name: string; city: string | null; organizationId: string | null; accountId: string; accessActive: boolean; purchasedMin: number; consumedMin: number; balanceMin: number; burnPerDay: number; daysToEmpty: number | null; cashLifetime: number; lastActivity: Date | null; hasCard: boolean; recurringUsageMin: number; renewsOn: Date | null; contactEmail: string | null };

async function officeStats(where: object): Promise<OfficeStat[]> {
  const offices = await prisma.office.findMany({
    where,
    select: { id: true, name: true, city: true, organizationId: true, stripeCustomerId: true, subscription: { select: { status: true, usageMinutes: true, currentPeriodEnd: true } } },
  });
  const ids = offices.map((o) => o.id);
  if (ids.length === 0) return [];
  const cfg = await getPricingConfig();
  const [bundles, sessions, admins] = await Promise.all([
    prisma.conversationBundle.findMany({ where: { officeId: { in: ids } }, select: { officeId: true, minutesPurchased: true, amountCents: true } }),
    // Exclude sessions metered against another pool (group/DSO coach organizationId,
    // and call-center agents' callCenterOrgId) so they don't inflate a served
    // office's burn/balance — the office never bought those minutes.
    prisma.session.findMany({ where: { officeId: { in: ids }, organizationId: null, callCenterOrgId: null, kind: { not: "LIVE" }, durationSeconds: { not: null }, isAudit: false }, select: { officeId: true, durationSeconds: true, startedAt: true } }),
    // Office admins → the default billing contact for each location.
    prisma.user.findMany({ where: { officeId: { in: ids }, role: "OFFICE_ADMIN" }, select: { officeId: true, email: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const contactByOffice = new Map<string, string>();
  for (const a of admins) if (a.officeId && a.email && !contactByOffice.has(a.officeId)) contactByOffice.set(a.officeId, a.email);
  const since30 = new Date(Date.now() - 30 * 86400_000);
  return offices.map((o) => {
    const ob = bundles.filter((b) => b.officeId === o.id);
    const os = sessions.filter((s) => s.officeId === o.id);
    const purchasedMin = ob.reduce((a, b) => a + b.minutesPurchased, 0);
    const consumedMin = os.reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 60;
    const last30 = os.filter((s) => s.startedAt >= since30).reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 60;
    const burnPerDay = last30 / 30;
    const balanceMin = purchasedMin - consumedMin;
    return {
      id: o.id,
      name: o.name,
      city: o.city,
      organizationId: o.organizationId,
      accountId: o.organizationId ?? o.id,
      accessActive: o.subscription?.status === "ACTIVE",
      purchasedMin: Math.round(purchasedMin),
      consumedMin: Math.round(consumedMin),
      balanceMin: Math.round(balanceMin),
      burnPerDay: r2(burnPerDay),
      daysToEmpty: burnPerDay > 0 ? Math.round(balanceMin / burnPerDay) : null,
      cashLifetime: r2(ob.reduce((a, b) => a + cashOf(b, cfg), 0)),
      lastActivity: os.reduce<Date | null>((acc, s) => (!acc || s.startedAt > acc ? s.startedAt : acc), null),
      hasCard: Boolean(o.stripeCustomerId),
      recurringUsageMin: o.subscription?.usageMinutes ?? 0,
      renewsOn: o.subscription?.currentPeriodEnd ?? null,
      contactEmail: contactByOffice.get(o.id) ?? null,
    };
  });
}

export async function getPlatformAccounts() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true, type: true } });
  const offices = await prisma.office.findMany({ where: { isProspect: false }, select: { id: true, organizationId: true } });
  const stats = await officeStats({ isProspect: false });
  const byId = new Map(stats.map((s) => [s.id, s]));
  const access = (await getPricingConfig()).accessMonthly;

  const roll = (officeIds: string[]) => {
    const ss = officeIds.map((id) => byId.get(id)).filter(Boolean) as OfficeStat[];
    return {
      locations: ss.length,
      activeAccess: ss.filter((s) => s.accessActive).length,
      mrr: r2(ss.filter((s) => s.accessActive).length * access),
      balanceMin: ss.reduce((a, s) => a + s.balanceMin, 0),
      cashLifetime: r2(ss.reduce((a, s) => a + s.cashLifetime, 0)),
      burnPerDay: r2(ss.reduce((a, s) => a + s.burnPerDay, 0)),
      lastActivity: ss.reduce<Date | null>((acc, s) => (s.lastActivity && (!acc || s.lastActivity > acc) ? s.lastActivity : acc), null),
    };
  };

  const accounts: { id: string; name: string; kind: "group" | "single"; type: string; locations: number; activeAccess: number; mrr: number; balanceMin: number; cashLifetime: number; burnPerDay: number; daysToEmpty: number | null; lastActivity: Date | null }[] = [];

  for (const org of orgs) {
    const ids = offices.filter((o) => o.organizationId === org.id).map((o) => o.id);
    if (ids.length === 0) continue;
    const r = roll(ids);
    accounts.push({ id: org.id, name: org.name, kind: "group", type: ids.length > 1 ? "Group / DSO" : "Group", ...r, daysToEmpty: r.burnPerDay > 0 ? Math.round(r.balanceMin / r.burnPerDay) : null });
  }
  for (const o of offices.filter((x) => !x.organizationId)) {
    const r = roll([o.id]);
    const st = byId.get(o.id);
    accounts.push({ id: o.id, name: st?.name ?? "Practice", kind: "single", type: "Single practice", ...r, daysToEmpty: r.burnPerDay > 0 ? Math.round(r.balanceMin / r.burnPerDay) : null });
  }
  return accounts.sort((a, b) => b.mrr - a.mrr || b.cashLifetime - a.cashLifetime);
}

export async function getPlatformAccountDetail(id: string) {
  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true, name: true, type: true } });
  const officeWhere = org ? { organizationId: org.id, isProspect: false } : { id, isProspect: false };
  const locations = await officeStats(officeWhere);
  if (locations.length === 0 && !org) return null;

  const officeIds = locations.map((l) => l.id);
  const [users, recentBundles] = await Promise.all([
    prisma.user.findMany({ where: { officeId: { in: officeIds } }, select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, officeId: true } }),
    prisma.conversationBundle.findMany({ where: { officeId: { in: officeIds } }, orderBy: { purchasedAt: "desc" }, take: 12, select: { officeId: true, minutesPurchased: true, amountCents: true, purchasedAt: true } }),
  ]);
  const officeName = new Map(locations.map((l) => [l.id, l.name]));
  const cfg = await getPricingConfig();

  return {
    id,
    name: org?.name ?? locations[0]?.name ?? "Account",
    kind: org ? ("group" as const) : ("single" as const),
    mrr: r2(locations.filter((l) => l.accessActive).length * cfg.accessMonthly),
    balanceMin: locations.reduce((a, l) => a + l.balanceMin, 0),
    cashLifetime: r2(locations.reduce((a, l) => a + l.cashLifetime, 0)),
    locations,
    users: users.map((u) => ({ id: u.id, name: fullName(u.firstName, u.lastName), email: u.email, role: u.role, status: u.status, location: officeName.get(u.officeId ?? "") ?? "—" })),
    transactions: recentBundles.map((b) => ({ when: b.purchasedAt, location: officeName.get(b.officeId) ?? "—", minutes: b.minutesPurchased, amount: r2(cashOf(b, cfg)) })),
  };
}

// ---- alerts (push, don't make them dig) ----
export async function getPlatformAlerts() {
  const cfg = await getPlatformConfig();
  const stats = await officeStats({ isProspect: false });
  const idleCut = Date.now() - cfg.alertZeroUsageDays * 86400_000;

  const lowBalance = stats
    .filter((s) => s.balanceMin > 0 && s.daysToEmpty != null && s.daysToEmpty <= cfg.alertLowBalanceDays)
    .sort((a, b) => (a.daysToEmpty ?? 0) - (b.daysToEmpty ?? 0))
    .map((s) => ({ accountId: s.accountId, name: s.name, daysToEmpty: s.daysToEmpty, balanceMin: s.balanceMin }));
  const idle = stats
    .filter((s) => s.accessActive && (!s.lastActivity || s.lastActivity.getTime() < idleCut))
    .map((s) => ({ accountId: s.accountId, name: s.name, lastActivity: s.lastActivity }));
  const topBurners = [...stats]
    .filter((s) => s.burnPerDay > 0)
    .sort((a, b) => b.burnPerDay - a.burnPerDay)
    .slice(0, 5)
    .map((s) => ({ accountId: s.accountId, name: s.name, burnPerDay: s.burnPerDay }));

  const outstandingMin = stats.reduce((a, s) => a + Math.max(0, s.balanceMin), 0);
  const liabilityTotal = outstandingMin * MINUTE_COST_USD;
  const liabilityOver = liabilityTotal > cfg.alertLiabilityCeiling;

  return {
    lowBalance,
    idle,
    topBurners,
    liability: { total: r2(liabilityTotal), over: liabilityOver, ceiling: cfg.alertLiabilityCeiling },
    count: lowBalance.length + idle.length + (liabilityOver ? 1 : 0),
  };
}

// ---- projections + scenario baseline ----
export async function getPlatformProjections() {
  const cfg = await getPlatformConfig();
  const [stats, orgs, audits] = await Promise.all([
    officeStats({ isProspect: false }),
    prisma.organization.findMany({ select: { id: true, name: true } }),
    prisma.setterAudit.findMany({ select: { status: true, office: { select: { isProspect: true } } } }),
  ]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  const activeAccess = stats.filter((s) => s.accessActive).length;
  const totalBurnPerDay = stats.reduce((a, s) => a + s.burnPerDay, 0);
  const monthlyBurnMin = totalBurnPerDay * 30;
  const outstandingMin = stats.reduce((a, s) => a + Math.max(0, s.balanceMin), 0);
  const purchasedMin = stats.reduce((a, s) => a + s.purchasedMin, 0);
  const cashTotal = stats.reduce((a, s) => a + s.cashLifetime, 0);
  const blendedRate = purchasedMin > 0 ? cashTotal / purchasedMin : cfg.basePerMin;

  // distinct accounts
  const accountIds = new Set(stats.map((s) => s.accountId));

  // days-to-empty per account (aggregate balance + burn)
  const acc = new Map<string, { name: string; balanceMin: number; burnPerDay: number }>();
  for (const s of stats) {
    const name = orgName.get(s.accountId) ?? s.name;
    const a = acc.get(s.accountId) ?? { name, balanceMin: 0, burnPerDay: 0 };
    a.balanceMin += s.balanceMin;
    a.burnPerDay += s.burnPerDay;
    acc.set(s.accountId, a);
  }
  const daysToEmpty = [...acc.entries()]
    .map(([id, a]) => ({ id, name: a.name, balanceMin: Math.round(a.balanceMin), burnPerDay: r2(a.burnPerDay), days: a.burnPerDay > 0 ? Math.round(a.balanceMin / a.burnPerDay) : null }))
    .filter((a) => a.burnPerDay > 0)
    .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));

  // liability burn-down (6 months at current consumption)
  const liabilitySchedule: { month: number; remaining: number }[] = [];
  let remain = outstandingMin;
  for (let m = 1; m <= 6; m++) {
    remain = Math.max(0, remain - monthlyBurnMin);
    liabilitySchedule.push({ month: m, remaining: r2(remain * MINUTE_COST_USD) });
  }

  const taken = audits.length;
  const converted = audits.filter((a) => a.office && !a.office.isProspect).length;

  return {
    baseline: {
      accounts: accountIds.size,
      activeLocations: activeAccess,
      accessMonthly: cfg.accessMonthly,
      blendedRate: r2(blendedRate),
      minuteCost: MINUTE_COST_USD,
      avgBurnPerLocationMonthly: activeAccess ? Math.round(monthlyBurnMin / activeAccess) : 0,
      currentMRR: r2(activeAccess * cfg.accessMonthly),
      monthlyMinuteRevenue: r2(monthlyBurnMin * blendedRate),
      outstandingLiability: r2(outstandingMin * MINUTE_COST_USD),
    },
    daysToEmpty,
    liabilitySchedule,
    assessment: { taken, converted, rate: taken > 0 ? Math.round((converted / taken) * 100) : 0 },
  };
}
