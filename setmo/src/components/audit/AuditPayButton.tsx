"use client";

import { useState } from "react";

// $50 self-serve unlock for a free-email / duplicate-domain audit.
export function AuditPayButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/audit/${id}/pay`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setErr(data.error ?? "Couldn't start checkout.");
    } catch {
      setErr("Couldn't reach checkout. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <button className="btn btn-primary" onClick={pay} disabled={busy}>
        {busy ? "Opening checkout…" : "Pay $50 and start now"}
      </button>
      {err && <p className="audit-note" style={{ color: "#b42318" }}>{err}</p>}
      <p className="audit-note">Skip the wait — unlock this audit instantly for $50.</p>
    </div>
  );
}
