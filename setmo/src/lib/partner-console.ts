import { prisma } from "@/lib/db";
import { getPartnerWallet, callTokens } from "@/lib/partner-wallet";
import type { PartnerMode } from "@/generated/prisma/client";

// What the platform console shows about a partner's API integration, per mode:
// the wallet, keys, where results go, which sites may frame the call, and the
// locations and calls that came through.

export type PartnerApiModeView = Awaited<ReturnType<typeof modeView>>;

async function modeView(partnerId: string, mode: PartnerMode) {
  const [wallet, entries, keys, integration, refs, deliveries] = await Promise.all([
    getPartnerWallet(partnerId, mode),
    prisma.partnerWalletEntry.findMany({ where: { partnerId, mode }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.partnerApiKey.findMany({ where: { partnerId, mode }, orderBy: { createdAt: "desc" }, select: { id: true, label: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true } }),
    prisma.partnerIntegration.findUnique({ where: { partnerId_mode: { partnerId, mode } } }),
    prisma.partnerRef.findMany({ where: { partnerId, mode, kind: "LOCATION" }, select: { externalId: true, officeId: true } }),
    prisma.partnerWebhookDelivery.findMany({
      where: { partnerId, mode },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, type: true, sessionId: true, status: true, attempts: true, lastStatus: true, lastError: true, createdAt: true, deliveredAt: true, nextAttemptAt: true },
    }),
  ]);

  const officeIds = refs.map((r) => r.officeId).filter(Boolean) as string[];
  const [offices, trainees, calls] = await Promise.all([
    prisma.office.findMany({ where: { id: { in: officeIds } }, select: { id: true, name: true, city: true, doctorName: true, createdAt: true } }),
    prisma.user.groupBy({ by: ["officeId"], where: { officeId: { in: officeIds }, partnerRefs: { some: { partnerId, mode, kind: "TRAINEE" } } }, _count: { _all: true } }),
    prisma.session.findMany({
      where: { partnerId, partnerMode: mode },
      select: { officeId: true, startedAt: true, durationSeconds: true, status: true },
    }),
  ]);
  const ext = new Map(refs.map((r) => [r.officeId, r.externalId]));
  const traineeCount = new Map(trainees.map((t) => [t.officeId, t._count._all]));
  const locations = offices
    .map((o) => {
      const mine = calls.filter((c) => c.officeId === o.id);
      const last = mine.reduce<Date | null>((acc, c) => (!acc || c.startedAt > acc ? c.startedAt : acc), null);
      return {
        id: o.id,
        externalId: ext.get(o.id) ?? "",
        name: o.name,
        city: o.city,
        doctorName: o.doctorName,
        trainees: traineeCount.get(o.id) ?? 0,
        calls: mine.filter((c) => c.status === "SCORED").length,
        tokens: mine.reduce((a, c) => a + (c.status === "FAILED" ? 0 : callTokens(c.durationSeconds)), 0),
        lastCall: last,
        createdAt: o.createdAt,
      };
    })
    .sort((a, b) => +(b.lastCall ?? b.createdAt) - +(a.lastCall ?? a.createdAt));

  const since30 = Date.now() - 30 * 86400_000;
  return {
    mode,
    wallet,
    entries,
    keys,
    integration: integration
      ? { webhookUrl: integration.webhookUrl, allowedOrigins: integration.allowedOrigins, accentColor: integration.accentColor, hasSecret: Boolean(integration.webhookSecret) }
      : null,
    locations,
    totals: {
      locations: locations.length,
      trainees: locations.reduce((a, l) => a + l.trainees, 0),
      calls: calls.filter((c) => c.status === "SCORED").length,
      calls30: calls.filter((c) => c.status === "SCORED" && c.startedAt.getTime() >= since30).length,
    },
    deliveries,
  };
}

export async function getPartnerApiConsole(partnerId: string) {
  const [live, test] = await Promise.all([modeView(partnerId, "LIVE"), modeView(partnerId, "TEST")]);
  return { live, test };
}

/** A compact summary for the partner's own portal (admins only). Null when the
 *  partner doesn't run on the API. */
export async function getPartnerApiSummary(partnerId: string) {
  const [hasLive, wallet, locations, trainees, calls30] = await Promise.all([
    prisma.partnerWalletEntry.findFirst({ where: { partnerId, mode: "LIVE" }, select: { id: true } }),
    getPartnerWallet(partnerId, "LIVE"),
    prisma.partnerRef.count({ where: { partnerId, mode: "LIVE", kind: "LOCATION" } }),
    prisma.partnerRef.count({ where: { partnerId, mode: "LIVE", kind: "TRAINEE" } }),
    prisma.session.count({ where: { partnerId, partnerMode: "LIVE", status: "SCORED", startedAt: { gte: new Date(Date.now() - 30 * 86400_000) } } }),
  ]);
  if (!hasLive && locations === 0) return null;
  return { balanceTokens: wallet.balanceTokens, usedTokens: wallet.usedTokens, locations, trainees, calls30 };
}
