"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

// Opens the Stripe customer portal for the group's coach-token wallet (update/
// remove card, download receipts). Only rendered once a card is on file. On a
// refusal, says why under the button.
export function GroupManageCardButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Back from Stripe without a reload (the back/forward cache, or an in-app
  // browser sheet closing on a phone): the button works again.
  useEffect(() => {
    const ready = () => {
      if (document.visibilityState === "visible") setBusy(false);
    };
    window.addEventListener("pageshow", ready);
    document.addEventListener("visibilitychange", ready);
    return () => {
      window.removeEventListener("pageshow", ready);
      document.removeEventListener("visibilitychange", ready);
    };
  }, []);

  async function open() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/group/billing-portal", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url;
        return;
      }
      setErr(res.status === 401 ? "Your session has ended — sign in again, then try once more." : j.error ?? "Couldn't open the billing portal. Try again in a minute, or email hello@growdental.ai.");
    } catch {
      setErr("Couldn't reach SetMo — check your connection and try again.");
    }
    setBusy(false);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, maxWidth: 320 }}>
      <button className="btn btn-ghost" onClick={open} disabled={busy} style={{ padding: "8px 14px", fontSize: 13 }}>
        <Icon name="card" size={15} /> {busy ? "Opening…" : "Manage card"}
      </button>
      {err && <p role="alert" style={{ color: "var(--amber)", fontSize: 12.5, textAlign: "right" }}>{err}</p>}
    </div>
  );
}
