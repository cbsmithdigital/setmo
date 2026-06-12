"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ROLE_LABEL } from "@/lib/format";

// Shown only for multi-role users. Switching flips the active-role cookie;
// nav, data, and the available agent all follow automatically.
export function RoleSwitcher({ roles, activeRole }: { roles: string[]; activeRole: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pick(role: string) {
    setOpen(false);
    if (role === activeRole || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(data.home ?? "/");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "relative", marginBottom: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
          borderRadius: 10, border: "1px solid var(--line)", background: "var(--s2)", textAlign: "left",
        }}
      >
        <Icon name="team" size={15} style={{ color: "var(--purple-2)" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: ".03em" }}>Viewing as</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{ROLE_LABEL[activeRole as keyof typeof ROLE_LABEL] ?? activeRole}</div>
        </div>
        <Icon name="arrow" size={14} style={{ color: "var(--muted)", transform: open ? "rotate(-90deg)" : "rotate(90deg)" }} />
      </button>

      {open && (
        <div
          className="card"
          style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, padding: 6, background: "var(--s2)", zIndex: 20 }}
        >
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => pick(r)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px",
                borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: r === activeRole ? "var(--s3)" : "transparent",
                color: r === activeRole ? "var(--text)" : "var(--text-2)",
              }}
            >
              {ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r}
              {r === activeRole && <Icon name="check" size={13} sw={3} style={{ marginLeft: "auto", color: "var(--mint)" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
