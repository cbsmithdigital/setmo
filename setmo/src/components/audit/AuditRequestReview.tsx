"use client";

import { useState } from "react";

export function AuditRequestReview({ auditId }: { auditId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function request() {
    setState("sending");
    try {
      await fetch(`/api/audit/${auditId}/request-review`, { method: "POST" });
    } finally {
      setState("sent");
    }
  }

  if (state === "sent") {
    return <p style={{ color: "var(--mint-deep)", fontWeight: 600, fontSize: 14.5, marginTop: 18 }}>Review requested ✓ — we&apos;ll confirm and email you shortly.</p>;
  }
  return (
    <button className="btn btn-primary" style={{ marginTop: 18 }} disabled={state === "sending"} onClick={request}>
      {state === "sending" ? "Requesting…" : "This is my practice email — request review"}
    </button>
  );
}
