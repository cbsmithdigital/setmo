import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { initialsOf, fullName, ROLE_LABEL } from "@/lib/format";

// Every authenticated screen depends on the request's auth cookies.
export const dynamic = "force-dynamic";

// Shell layout for all logged-in app screens (sidebar + main).
// Full-bleed screens (login, live session) live outside this route group.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <>
      <div className="app-bg" />
      <div className="shell">
        <Sidebar
          role={user.role}
          name={fullName(user.firstName, user.lastName)}
          roleLabel={ROLE_LABEL[user.role]}
          initials={initialsOf(user.firstName, user.lastName)}
        />
        <main className="main">{children}</main>
      </div>
    </>
  );
}
