import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveAnalyticsRange } from "@/lib/queries";
import { getOfficeSetterDetail } from "@/lib/office";
import { canAccessGroupOffice } from "@/lib/group";
import { SetterDetailView } from "@/components/office/SetterDetailView";

export default async function GroupSetterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ officeId: string; setterId: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireRole("GROUP_ADMIN", "MULTI_PRACTICE_ADMIN", "PLATFORM_ADMIN");
  const { officeId, setterId } = await params;

  if (!(await canAccessGroupOffice(user, officeId))) notFound();
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { name: true } });
  if (!office) notFound();

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
