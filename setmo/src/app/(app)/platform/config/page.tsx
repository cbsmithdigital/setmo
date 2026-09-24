import { requireRole } from "@/lib/auth";
import { getPlatformConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { ConfigEditor } from "@/components/platform/ConfigEditor";
import { ServiceCatalog, type ServiceRow } from "@/components/platform/ServiceCatalog";
import { hasPack } from "@/lib/packs/registry";
import { SERVICE_META, SERVICE_ORDER } from "@/lib/service-meta";

export default async function PlatformConfigPage() {
  await requireRole("PLATFORM_ADMIN"); // Super-Admin only
  const [config, agents, officeCounts, sessionCounts, pilotRows, officeRows] = await Promise.all([
    getPlatformConfig(),
    prisma.agent.findMany({ select: { serviceType: true, status: true } }),
    // Real accounts only — demo / test offices don't count toward adoption.
    prisma.officeService.groupBy({ by: ["serviceType"], where: { enabled: true, office: { isDemo: false } }, _count: true }),
    prisma.session.groupBy({ by: ["serviceType"], where: { kind: "PRACTICE", status: "SCORED", office: { isDemo: false } }, _count: true }),
    prisma.officeService.findMany({ where: { pilot: true }, select: { serviceType: true, officeId: true, office: { select: { name: true, isDemo: true, organization: { select: { name: true } } } } } }),
    prisma.office.findMany({ where: { isProspect: false }, select: { id: true, name: true, isDemo: true, organization: { select: { name: true } } }, orderBy: { name: "asc" } }),
  ]);
  // Every partner demo pilots New patient under the same practice names, so demo
  // offices are labelled — and listed after the real ones in the picker.
  const label = (o: { name: string; isDemo: boolean; organization: { name: string } | null }) =>
    o.isDemo ? `${o.name} (demo${o.organization ? ` · ${o.organization.name}` : ""})` : o.name;
  const offices = officeRows
    .map((o) => ({ id: o.id, name: label(o), isDemo: o.isDemo }))
    .sort((a, b) => Number(a.isDemo) - Number(b.isDemo))
    .map(({ id, name }) => ({ id, name }));

  const statusBy = new Map(agents.map((a) => [a.serviceType, a.status]));
  const officesBy = new Map(officeCounts.map((o) => [o.serviceType, o._count]));
  const sessionsBy = new Map(sessionCounts.map((s) => [s.serviceType, s._count]));
  const services: ServiceRow[] = SERVICE_ORDER.map((key) => ({
    key,
    name: SERVICE_META[key].name,
    status: statusBy.get(key) ?? "PLANNED",
    hasPack: hasPack(key),
    offices: officesBy.get(key) ?? 0,
    sessions: sessionsBy.get(key) ?? 0,
    pilots: pilotRows.filter((p) => p.serviceType === key).map((p) => ({ officeId: p.officeId, name: label(p.office) })),
  }));

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Configuration</h1>
          <p>Call types, pricing, thresholds, and alert settings. Super-Admin only · changes are audit-logged.</p>
        </div>
      </div>
      <div className="content" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <ServiceCatalog services={services} offices={offices} />
        <ConfigEditor config={config} />
      </div>
    </>
  );
}
