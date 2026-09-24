import { Sidebar } from "@/components/Sidebar";
import { requireUser, getActiveRole } from "@/lib/auth";
import { initialsOf, fullName, ROLE_LABEL } from "@/lib/format";
import { ImpersonationBanner } from "@/components/platform/ImpersonationBanner";
import { inDemoAccount } from "@/lib/demo-shared";

// Every authenticated screen depends on the request's auth cookies.
export const dynamic = "force-dynamic";

// Shell layout for all logged-in app screens (sidebar + main).
// Full-bleed screens (login, live session) live outside this route group.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const activeRole = getActiveRole(user);
  // Practice / group hats that act inside a demo account are labelled as such, so
  // nobody mistakes the demo for a real practice (or the other way round).
  const demoRoles = inDemoAccount(user) ? user.roles.filter((r) => r === "SETTER" || r === "OFFICE_ADMIN" || r === "GROUP_ADMIN") : [];

  return (
    <>
      <div className="app-bg" />
      <div className="shell">
        <Sidebar
          role={activeRole}
          roles={user.roles}
          demoRoles={demoRoles}
          isAgent={Boolean(user.callCenterPodId) && activeRole === "SETTER"}
          name={fullName(user.firstName, user.lastName)}
          roleLabel={ROLE_LABEL[activeRole]}
          initials={initialsOf(user.firstName, user.lastName)}
        />
        <main className="main">
          {user.impersonatedBy && <ImpersonationBanner email={user.email} />}
          {children}
        </main>
      </div>
    </>
  );
}
