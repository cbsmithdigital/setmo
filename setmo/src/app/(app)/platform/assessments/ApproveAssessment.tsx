"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Approve a free assessment held for review: it goes live and the prospect is
 *  emailed their link (POST /api/audit/:id/approve). Once it's live (no report
 *  yet), the link can be emailed again. */
export function ApproveAssessment({ auditId, email, pending, live }: { auditId: string; email: string; pending: boolean; live: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function send(resend: boolean) {
    if (!window.confirm(resend ? `Email ${email} their link again?` : `Approve this assessment? ${email} gets an email with their link to start the call.`)) return;
    setBusy(true);
    setMsg(null);
    setLink(null);
    try {
      const res = await fetch(`/api/audit/${auditId}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resend }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? (resend ? "Couldn't send it." : "Couldn't approve it.")); return; }
      if (j.already) setMsg("It wasn't waiting for review any more — nothing changed.");
      else if (j.emailed) setMsg(resend ? `Sent — we emailed ${email} their link again.` : `Approved — we emailed ${email} their link.`);
      else { setMsg(resend ? "The email didn't go out. Send them this link:" : "Approved, but the email didn't go out. Send them this link:"); setLink(j.link ?? null); }
      router.refresh();
    } catch {
      setMsg("Couldn't reach SetMo — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {pending && (
        <button className="btn btn-primary" onClick={() => void send(false)} disabled={busy} style={{ padding: "10px 18px" }}>
          {busy ? "Approving…" : "Approve & email their link"}
        </button>
      )}
      {live && (
        <button className="btn btn-ghost" onClick={() => void send(true)} disabled={busy} style={{ padding: "10px 18px" }}>
          {busy ? "Sending…" : "Email their link again"}
        </button>
      )}
      {msg && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{msg}</p>}
      {link && <p style={{ fontSize: 12.5, marginTop: 6, wordBreak: "break-all" }}>{link}</p>}
    </div>
  );
}
