import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { resolveAnalyticsRange } from "@/lib/queries";
import { getOfficeSetterDetail } from "@/lib/office";
import { SetterDetailView } from "@/components/office/SetterDetailView";

export default async function SetterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const { id } = await params;
  const sp = await searchParams;
  const { key, range, label } = resolveAnalyticsRange(sp);
  const t = await getOfficeSetterDetail(user.officeId!, id, range);
  if (!t) notFound();

  return (
    <SetterDetailView
      t={t}
      label={label}
      rangeKey={key}
      from={sp.from}
      to={sp.to}
      controlsBasePath={`/office/team/${id}`}
      backHref="/office/team"
      backLabel="Team"
    />
  );
}
