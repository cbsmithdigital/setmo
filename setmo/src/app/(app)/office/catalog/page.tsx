import { requireRole } from "@/lib/auth";
import { getOfficeCatalog } from "@/lib/queries";
import { CatalogClient } from "@/components/office/CatalogClient";

export default async function OfficeCatalogPage() {
  const user = await requireRole("OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN");
  const { services, profile } = await getOfficeCatalog(user.officeId!);
  return <CatalogClient services={services} profile={profile} />;
}
