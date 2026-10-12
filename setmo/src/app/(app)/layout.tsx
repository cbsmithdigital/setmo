import { Sidebar } from "@/components/Sidebar";
import { requireUser, getActiveRole } from "@/lib/auth";
import { initialsOf, fullName, ROLE_LABEL } from "@/lib/format";
import { ImpersonationBanner } from "@/components/platform/ImpersonationBanner";
import { InstallBanner } from "@/components/InstallBanner";
import { NotifyPrompt } from "@/components/NotifyPrompt";
import { inDemoAccount } from "@/lib/demo-shared";
import { tabsFor } from "@/lib/nav-tabs";

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
  // Phones get a bottom tab bar for the role's main screens; the page leaves
  // room for it.
  const isAgent = Boolean(user.callCenterPodId) && activeRole === "SETTER";
  const hasTabbar = tabsFor(activeRole, isAgent).length > 0;

  return (
    <>
      <div className="app-bg" />
      <div className={"shell" + (hasTabbar ? " has-tabbar" : "")}>
        <Sidebar
          role={activeRole}
          roles={user.roles}
          demoRoles={demoRoles}
          isAgent={isAgent}
          notifications={!user.impersonatedBy}
          name={fullName(user.firstName, user.lastName)}
          roleLabel={ROLE_LABEL[activeRole]}
          initials={initialsOf(user.firstName, user.lastName)}
        />
        <main className="main">
          {user.impersonatedBy && <ImpersonationBanner email={user.email} />}
          {!user.impersonatedBy && <InstallBanner />}
          {!user.impersonatedBy && <NotifyPrompt />}
          {children}
        </main>
      </div>
    </>
  );
}
