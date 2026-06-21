import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fullName } from "@/lib/format";
import { AdminsManager } from "@/components/platform/AdminsManager";

export default async function PlatformAdminsPage() {
  const user = await requireRole("PLATFORM_ADMIN"); // Super-Admin only
  const rows = await prisma.user.findMany({
    where: { role: { in: ["PLATFORM_ADMIN", "SUPPORT"] } },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  const admins = rows.map((r) => ({ id: r.id, email: r.email, name: fullName(r.firstName, r.lastName), role: r.role }));

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Internal admins</h1>
          <p>Manage Super-Admin and Success/Support access. Super-Admin only · audit-logged.</p>
        </div>
      </div>
      <div className="content">
        <AdminsManager admins={admins} selfId={user.id} />
      </div>
    </>
  );
}
