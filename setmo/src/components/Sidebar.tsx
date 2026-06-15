"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { createClient } from "@/lib/supabase/client";

type NavItem = { href: string; label: string; icon: IconName; badge?: string; ai?: boolean };

const NAV_SETTER: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/practice", label: "Practice", icon: "mic" },
  { href: "/progress", label: "Progress", icon: "chart" },
  { href: "/trainings", label: "Trainings", icon: "book" },
  { href: "/coach", label: "Setty", icon: "chat", ai: true },
  { href: "/library", label: "Saved", icon: "doc" },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
];

const NAV_OFFICE: NavItem[] = [
  { href: "/office", label: "Overview", icon: "home" },
  { href: "/office/team", label: "Team", icon: "team" },
  { href: "/office/catalog", label: "Service catalog", icon: "target" },
  { href: "/office/billing", label: "Usage & billing", icon: "card" },
  { href: "/coach", label: "Setty", icon: "chat", ai: true },
  { href: "/library", label: "Saved", icon: "doc" },
  { href: "/office/leaderboard", label: "Leaderboard", icon: "trophy" },
];

const NAV_GROUP: NavItem[] = [
  { href: "/group", label: "Portfolio", icon: "building" },
  { href: "/coach", label: "Setty", icon: "chat", ai: true },
];

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  SETTER: NAV_SETTER,
  OFFICE_ADMIN: NAV_OFFICE,
  GROUP_ADMIN: NAV_GROUP,
};

export function Sidebar({
  role,
  name,
  roleLabel,
  initials,
  roles = [],
}: {
  role: string;
  name: string;
  roleLabel: string;
  initials: string;
  roles?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = NAV_BY_ROLE[role] ?? NAV_SETTER;
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Highlight only the MOST specific matching item, so index routes like
  // /office don't stay lit when you're on /office/team. Session & results map
  // back to Practice.
  const activeHref = (() => {
    const hrefs = nav.map((n) => n.href);
    const matched = hrefs.filter((h) => pathname === h || pathname.startsWith(h + "/"));
    if ((pathname.startsWith("/session") || pathname.startsWith("/results")) && hrefs.includes("/practice")) {
      matched.push("/practice");
    }
    return matched.sort((a, b) => b.length - a.length)[0] ?? null;
  })();
  const isActive = (href: string) => href === activeHref;

  async function logout() {
    try {
      await fetch("/api/role", { method: "DELETE" });
      await createClient().auth.signOut();
    } catch {
      /* ignore */
    }
    router.push("/login");
  }

  return (
    <>
      {/* mobile top bar (hidden on desktop) */}
      <header className="mobilebar">
        <button className="mobilebar-btn" onClick={() => setOpen(true)} aria-label="Open menu">
          <span /><span /><span />
        </button>
        <Link className="sb-logo" href={nav[0].href} style={{ padding: 0, fontSize: 19 }}>
          <Image src="/setmo-icon.png" alt="" width={26} height={26} style={{ objectFit: "contain" }} />
          <span>Set<span style={{ color: "var(--mint)" }}>Mo</span></span>
        </Link>
      </header>

      {open && <div className="nav-backdrop" onClick={close} />}

      <aside className={"sidebar" + (open ? " open" : "")}>
        <button className="sidebar-close" onClick={close} aria-label="Close menu">
          <Icon name="x" size={20} />
        </button>
        <Link className="sb-logo" href={nav[0].href} onClick={close}>
          <Image src="/setmo-icon.png" alt="" width={34} height={34} style={{ objectFit: "contain" }} />
          <span>
            Set<span style={{ color: "var(--mint)" }}>Mo</span>
          </span>
        </Link>

      <nav className="nav">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} onClick={close} className={"nav-i" + (isActive(n.href) ? " on" : "")}>
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
        {roles.length > 1 && <RoleSwitcher roles={roles} activeRole={role} />}
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
    </>
  );
}
