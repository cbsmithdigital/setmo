"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Force-regenerate Setty's cached "next move", then refresh the server data.
export function InsightRefreshButton({ scope, subjectId }: { scope: "SETTER" | "OFFICE" | "GROUP"; subjectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await fetch("/api/insights/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, subjectId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn btn-ghost" onClick={go} disabled={busy} style={{ padding: "6px 12px", fontSize: 12.5 }}>
      {busy ? "Thinking…" : "↻ Refresh"}
    </button>
  );
}
