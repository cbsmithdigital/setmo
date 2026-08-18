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
  { href: "/goals", label: "Goals & rewards", icon: "flame" },
  { href: "/trainings", label: "Trainings", icon: "book" },
  { href: "/coach", label: "Coach Setty", icon: "chat", ai: true },
  { href: "/library", label: "Saved", icon: "doc" },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
];

const NAV_OFFICE: NavItem[] = [
  { href: "/office", label: "Overview", icon: "home" },
  { href: "/office/team", label: "Team", icon: "team" },
  { href: "/office/goals", label: "Goals & rewards", icon: "flame" },
  { href: "/office/catalog", label: "Service catalog", icon: "target" },
  { href: "/resources", label: "Resources", icon: "book" },
  { href: "/office/billing", label: "Usage & billing", icon: "card" },
  { href: "/coach", label: "Coach Setty", icon: "chat", ai: true },
  { href: "/library", label: "Saved", icon: "doc" },
  { href: "/office/leaderboard", label: "Leaderboard", icon: "trophy" },
];

const NAV_GROUP: NavItem[] = [
  { href: "/group", label: "Portfolio", icon: "building" },
  { href: "/group/performance", label: "Performance", icon: "chart" },
  { href: "/group/goals", label: "Goals & rewards", icon: "flame" },
  { href: "/resources", label: "Resources", icon: "book" },
  { href: "/coach", label: "Coach Setty", icon: "chat", ai: true },
  { href: "/group/billing", label: "Billing", icon: "card" },
];

const NAV_PLATFORM: NavItem[] = [
  { href: "/platform", label: "Overview", icon: "chart" },
  { href: "/platform/accounts", label: "Accounts", icon: "building" },
  { href: "/platform/trainings", label: "Trainings", icon: "video" },
  { href: "/platform/partners", label: "Partners", icon: "team" },
  { href: "/platform/projections", label: "Projections", icon: "bolt" },
  { href: "/platform/audit", label: "Audit log", icon: "shield" },
];
// Super-Admin gets config + admin management on top of the shared platform nav.
const NAV_PLATFORM_SUPER: NavItem[] = [
  ...NAV_PLATFORM,
  { href: "/platform/callcenter", label: "Call centers", icon: "building" },
  { href: "/platform/config", label: "Configuration", icon: "gear" },
  { href: "/platform/admins", label: "Internal admins", icon: "team" },
];

const NAV_PARTNER: NavItem[] = [
  { href: "/partner", label: "Dashboard", icon: "home" },
  { href: "/partner/team", label: "Team & codes", icon: "team" },
];

// Senior call-center manager (CALL_CENTER_ADMIN) — whole-center depth: team +
// accounts + leaderboard span every pod (the floor pages are role-aware).
const NAV_CALLCENTER: NavItem[] = [
  { href: "/callcenter", label: "Overview", icon: "building" },
  { href: "/callcenter/team", label: "Team", icon: "team" },
  { href: "/callcenter/accounts", label: "Accounts", icon: "target" },
  { href: "/callcenter/leaderboard", label: "Leaderboard", icon: "trophy" },
  { href: "/coach", label: "Coach Setty", icon: "chat", ai: true },
  { href: "/callcenter/billing", label: "Billing", icon: "card" },
  { href: "/resources", label: "Resources", icon: "book" },
];

// Floor call-center manager (CALL_CENTER_MANAGER) — office-admin parity for their
// pod: team, accounts (served practices, read-only), leaderboard, voice coach.
const NAV_CALLCENTER_FLOOR: NavItem[] = [
  { href: "/callcenter", label: "Overview", icon: "building" },
  { href: "/callcenter/team", label: "Team", icon: "team" },
  { href: "/callcenter/accounts", label: "Accounts", icon: "target" },
  { href: "/callcenter/leaderboard", label: "Leaderboard", icon: "trophy" },
  { href: "/coach", label: "Coach Setty", icon: "chat", ai: true },
  { href: "/resources", label: "Resources", icon: "book" },
  { href: "/callcenter/billing", label: "Billing", icon: "card" },
];

// Call-center phone AGENTS are setters shared across offices (no single office).
// They get the full setter experience — Progress aggregates across every office
// they call for, and Leaderboard ranks them within their pod + the whole call
// center. (Goals stay off — those are office-scoped rewards.)
const NAV_AGENT: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/practice", label: "Practice", icon: "mic" },
  { href: "/progress", label: "Progress", icon: "chart" },
  { href: "/coach", label: "Coach Setty", icon: "chat", ai: true },
  { href: "/trainings", label: "Trainings", icon: "book" },
  { href: "/library", label: "Saved", icon: "doc" },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
];

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  SETTER: NAV_SETTER,
  OFFICE_ADMIN: NAV_OFFICE,
  GROUP_ADMIN: NAV_GROUP,
  PLATFORM_ADMIN: NAV_PLATFORM_SUPER,
  SUPPORT: NAV_PLATFORM,
  PARTNER_ADMIN: NAV_PARTNER,
  PARTNER_MEMBER: [{ href: "/partner", label: "Dashboard", icon: "home" }],
  CALL_CENTER_ADMIN: NAV_CALLCENTER,
  CALL_CENTER_MANAGER: NAV_CALLCENTER_FLOOR,
};

export function Sidebar({
  role,
  name,
  roleLabel,
  initials,
  roles = [],
  isAgent = false,
}: {
  role: string;
  name: string;
  roleLabel: string;
  initials: string;
  roles?: string[];
  isAgent?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = isAgent ? NAV_AGENT : NAV_BY_ROLE[role] ?? NAV_SETTER;
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
