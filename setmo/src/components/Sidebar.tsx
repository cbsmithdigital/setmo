"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/client";

type NavItem = { href: string; label: string; icon: IconName; badge?: string; ai?: boolean };

const NAV_SETTER: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/practice", label: "Practice", icon: "mic" },
  { href: "/progress", label: "Progress", icon: "chart" },
  { href: "/trainings", label: "Trainings", icon: "book" },
  { href: "/coach", label: "Coach", icon: "chat", ai: true },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
];

const NAV_OFFICE: NavItem[] = [
  { href: "/office", label: "Overview", icon: "home" },
  { href: "/office/team", label: "Team", icon: "team" },
  { href: "/office/catalog", label: "Service catalog", icon: "target" },
  { href: "/office/billing", label: "Usage & billing", icon: "card" },
  { href: "/office/leaderboard", label: "Leaderboard", icon: "trophy" },
];

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  SETTER: NAV_SETTER,
  OFFICE_ADMIN: NAV_OFFICE,
};

export function Sidebar({
  role,
  name,
  roleLabel,
  initials,
}: {
  role: string;
  name: string;
  roleLabel: string;
  initials: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = NAV_BY_ROLE[role] ?? NAV_SETTER;

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/")) ||
    // session & results map back to Practice
    (href === "/practice" && (pathname.startsWith("/session") || pathname.startsWith("/results")));

  async function logout() {
    try {
      await createClient().auth.signOut();
    } catch {
      /* ignore */
    }
    router.push("/login");
  }

  return (
    <aside className="sidebar">
      <Link className="sb-logo" href={nav[0].href}>
        <Image src="/setmo-icon.png" alt="" width={34} height={34} style={{ objectFit: "contain" }} />
        <span>
          Set<span style={{ color: "var(--mint)" }}>Mo</span>
        </span>
      </Link>

      <nav className="nav">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={"nav-i" + (isActive(n.href) ? " on" : "")}>
            <Icon name={n.icon} />
            {n.label}
            {n.badge && <span className="badge">{n.badge}</span>}
            {n.ai && (
              <span className="badge" style={{ background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff" }}>
                AI
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="sb-foot">
        <div className="sb-user" role="button" tabIndex={0} onClick={logout} title="Sign out">
          <div className="av">{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div className="nm">{name}</div>
            <div className="rl">{roleLabel}</div>
          </div>
          <Icon name="logout" size={16} style={{ marginLeft: "auto", color: "var(--muted)" }} />
        </div>
      </div>
    </aside>
  );
}
