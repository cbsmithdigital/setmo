import { notFound } from "next/navigation";
import { requireRole, getActiveRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveAnalyticsRange } from "@/lib/queries";
import { getOfficeSetterDetail } from "@/lib/office";
import { SetterDetailView } from "@/components/office/SetterDetailView";

export default async function GroupSetterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ officeId: string; setterId: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireRole("GROUP_ADMIN", "PLATFORM_ADMIN");
  const { officeId, setterId } = await params;

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { name: true, organizationId: true } });
  const allowed = office && (getActiveRole(user) === "PLATFORM_ADMIN" || office.organizationId === user.organizationId);
  if (!allowed) notFound();

  const sp = await searchParams;
  const { key, range, label } = resolveAnalyticsRange(sp);
  const t = await getOfficeSetterDetail(officeId, setterId, range);
  if (!t) notFound();

  return (
    <SetterDetailView
      t={t}
      label={label}
      rangeKey={key}
      from={sp.from}
      to={sp.to}
      controlsBasePath={`/group/office/${officeId}/setter/${setterId}`}
      backHref={`/group/office/${officeId}`}
      backLabel={office!.name}
      subtitlePrefix={`${office!.name} · setter`}
    />
  );
}
