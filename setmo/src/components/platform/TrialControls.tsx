"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Platform account page: push a free trial's end out a week. */
export function ExtendTrialButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function extend() {
    if (!window.confirm("Extend this free trial by 7 days? The trial reminder emails start over for the new date.")) return;
    setBusy(true);
    const res = await fetch("/api/platform/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "extend_trial", accountId, days: 7 }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) window.alert(j.error ?? "Couldn't extend the trial.");
    router.refresh();
  }
  return (
    <button className="btn btn-ghost" onClick={extend} disabled={busy} style={{ padding: "6px 12px", fontSize: 12.5 }}>
      {busy ? "Extending…" : "Extend 7 days"}
    </button>
  );
}
