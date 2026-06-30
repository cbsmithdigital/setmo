"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

// Opens the Stripe customer portal for the group's coach-token wallet (update/
// remove card, download receipts). Only rendered once a card is on file.
export function GroupManageCardButton() {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const res = await fetch("/api/group/billing-portal", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await res.json().catch(() => ({}));
      if (j.url) window.location.href = j.url;
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }
  return (
    <button className="btn btn-ghost" onClick={open} disabled={busy} style={{ padding: "8px 14px", fontSize: 13 }}>
      <Icon name="card" size={15} /> {busy ? "Opening…" : "Manage card"}
    </button>
  );
}
