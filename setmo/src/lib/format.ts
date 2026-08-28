import type { Role } from "@/generated/prisma/client";

export function fullName(firstName?: string | null, lastName?: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "—";
}

export function initialsOf(firstName?: string | null, lastName?: string | null): string {
  const a = (firstName ?? "").trim()[0] ?? "";
  const b = (lastName ?? "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export const ROLE_LABEL: Record<Role, string> = {
  PLATFORM_ADMIN: "Platform Admin",
  SUPPORT: "Success / Support",
  DISTRIBUTOR: "Distributor",
  CONSULTANT: "Consultant",
  PARTNER_ADMIN: "Partner Admin",
  PARTNER_MEMBER: "Partner Rep",
  CALL_CENTER_ADMIN: "Call Center Admin",
  CALL_CENTER_MANAGER: "Floor Manager",
  GROUP_ADMIN: "Group Admin",
  MULTI_PRACTICE_ADMIN: "Multi Practice Admin",
  OFFICE_ADMIN: "Office Admin",
  SETTER: "Appointment Setter",
};

/** Seconds -> "M:SS" */
export function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Seconds -> hours (1 decimal). */
export function toHours(seconds: number | bigint): number {
  return Number(seconds) / 3600;
}

/** Friendly relative label, e.g. "Today · 9:24 AM", "Yesterday · 4:10 PM", "Mon · 11:02 AM". */
export function whenLabel(date: Date): string {
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400_000);
  let day: string;
  if (days === 0) day = "Today";
  else if (days === 1) day = "Yesterday";
  else if (days < 7) day = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  else day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  return `${day} · ${time}`;
}

/** Compact relative label: "just now", "12m ago", "3h ago", "Yesterday", "Mon", "Apr 4". */
export function relativeShort(date: Date | null): string {
  if (!date) return "never";
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
