"use client";

import { useState } from "react";

// Confirm-to-act unsubscribe widget (no auto-action on load, so email-client
// link prefetching can't silently unsubscribe someone).
export function UnsubToggle({ u, t, initialOptOut }: { u: string; t: string; initialOptOut: boolean }) {
  const [optedOut, setOptedOut] = useState(initialOptOut);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function set(resubscribe: boolean) {
    setBusy(true);
    setErr(null);
    const qs = `u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}${resubscribe ? "&action=resubscribe" : ""}`;
    try {
      const res = await fetch(`/api/digest/unsubscribe?${qs}`, { method: "POST" });
      if (!res.ok) { setErr("That link is invalid or expired."); return; }
      setOptedOut(!resubscribe);
    } catch {
      setErr("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {optedOut ? (
        <>
          <p className="muted" style={{ fontSize: 15.5, marginBottom: 20 }}>You&apos;re unsubscribed from SetMo weekly summary emails. You&apos;ll still get account &amp; billing emails.</p>
          <button className="btn btn-ghost" disabled={busy} onClick={() => set(true)} style={{ padding: "10px 18px" }}>
            {busy ? "…" : "Resubscribe"}
          </button>
        </>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 15.5, marginBottom: 20 }}>Stop receiving the SetMo weekly summary email? Account &amp; billing emails will still come through.</p>
          <button className="btn btn-primary" disabled={busy} onClick={() => set(false)} style={{ padding: "10px 18px" }}>
            {busy ? "…" : "Unsubscribe me"}
          </button>
        </>
      )}
      {err && <p style={{ color: "var(--amber)", fontSize: 13, marginTop: 12 }}>{err}</p>}
    </div>
  );
}
