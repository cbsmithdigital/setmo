import { requireRole } from "@/lib/auth";
import { getPlatformConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { ConfigEditor } from "@/components/platform/ConfigEditor";
import { ServiceCatalog, type ServiceRow } from "@/components/platform/ServiceCatalog";
import { hasPack } from "@/lib/packs/registry";
import { SERVICE_META, SERVICE_ORDER } from "@/lib/service-meta";

export default async function PlatformConfigPage() {
  await requireRole("PLATFORM_ADMIN"); // Super-Admin only
  const [config, agents, officeCounts, sessionCounts] = await Promise.all([
    getPlatformConfig(),
    prisma.agent.findMany({ select: { serviceType: true, status: true } }),
    prisma.officeService.groupBy({ by: ["serviceType"], where: { enabled: true }, _count: true }),
    prisma.session.groupBy({ by: ["serviceType"], where: { kind: "PRACTICE", status: "SCORED" }, _count: true }),
  ]);

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
        <ServiceCatalog services={services} />
        <ConfigEditor config={config} />
      </div>
    </>
  );
}
