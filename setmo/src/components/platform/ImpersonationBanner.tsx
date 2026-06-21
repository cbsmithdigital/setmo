"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Shown app-wide while a platform admin is "viewing as" a customer user.
export function ImpersonationBanner({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function exit() {
    setBusy(true);
    await fetch("/api/platform/impersonate", { method: "DELETE" });
    router.replace("/platform/accounts");
    router.refresh();
  }
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "linear-gradient(90deg,#7c3aed,#f59e0b)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "8px 16px", fontSize: 13.5, fontWeight: 600 }}>
      <span>👁 Viewing as {email} — actions you take appear as them.</span>
      <button onClick={exit} disabled={busy} style={{ background: "rgba(255,255,255,.22)", border: "1px solid rgba(255,255,255,.5)", color: "#fff", borderRadius: 99, padding: "4px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
        {busy ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
