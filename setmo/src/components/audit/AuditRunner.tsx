"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuditCall } from "@/components/audit/AuditCall";

export function AuditRunner({
  id,
  contactName,
  totalCalls,
  maxSeconds,
  initialScored,
  initialTotal,
}: {
  id: string;
  contactName: string;
  totalCalls: number;
  maxSeconds: number;
  initialScored: number;
  initialTotal: number;
}) {
  const router = useRouter();
  const [scored, setScored] = useState(initialScored);
  const [started, setStarted] = useState(initialTotal); // calls created (started or done)
  const [inCall, setInCall] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [invite, setInvite] = useState("");
  const [invited, setInvited] = useState<"idle" | "ok" | "err">("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/audit/${id}/status`);
      if (!res.ok) return;
      const d = await res.json();
      setScored(d.scored);
      if (d.status === "SCORED") {
        if (pollRef.current) clearInterval(pollRef.current);
        router.refresh(); // report is ready
      }
    } catch {
      /* ignore */
    }
  }, [id, router]);

  // Poll while a call is being scored (or to catch up on load).
  useEffect(() => {
    if (!waiting) return;
    const kick = setTimeout(poll, 200);
    pollRef.current = setInterval(poll, 4000);
    return () => { clearTimeout(kick); if (pollRef.current) clearInterval(pollRef.current); };
  }, [waiting, poll]);

  const callsLeft = totalCalls - started;

  function onCallDone() {
    setInCall(false);
    setWaiting(true); // poll until this call's score lands (and finalize at 5)
  }

  async function sendInvite() {
    if (!invite.trim()) return;
    setInvited("idle");
    const res = await fetch(`/api/audit/${id}/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: invite.trim() }),
    });
    setInvited(res.ok ? "ok" : "err");
    if (res.ok) setInvite("");
  }

  return (
    <div className="audit-card">
      <div className="audit-steps">
        {Array.from({ length: totalCalls }, (_, i) => (
          <span key={i} className={"dot" + (i < scored ? " on" : "")} />
        ))}
      </div>
      <h3 style={{ fontSize: 23, marginBottom: 8 }}>
        {scored >= totalCalls ? "Scoring your report…" : `Hi ${contactName.split(" ")[0]} — let's run your 5 calls.`}
      </h3>
      <p style={{ color: "var(--m-muted)", fontSize: 15, marginBottom: 22 }}>
        {scored}/{totalCalls} scored{started > scored ? " · 1 scoring now" : ""}. Each call is a realistic AI lead — talk to it like a real inbound. Under 12 minutes each.
      </p>

      {scored < totalCalls && (
        <button
          className="btn btn-primary btn-block"
          onClick={() => { setStarted((s) => s + 1); setInCall(true); }}
          disabled={inCall || waiting || callsLeft <= 0}
          style={{ marginBottom: 14 }}
        >
          {waiting ? "Scoring last call…" : callsLeft <= 0 ? "All calls started" : started === 0 ? "Start my first call" : `Start call ${started + 1} of ${totalCalls}`}
        </button>
      )}

      {/* invite a setter to run the calls instead */}
      <div style={{ borderTop: "1px solid var(--m-line)", marginTop: 18, paddingTop: 18 }}>
        <label className="hint" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)" }}>Want your setter to run these instead?</label>
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <input type="email" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="setter@yourpractice.com" style={{ flex: 1, minWidth: 200 }} />
          <button className="btn btn-ghost" onClick={sendInvite} type="button">Send link</button>
        </div>
        {invited === "ok" && <p className="audit-note" style={{ color: "var(--mint-deep)" }}>Sent — they can run the calls from that link.</p>}
        {invited === "err" && <p className="audit-note" style={{ color: "#b42318" }}>Couldn&apos;t send — check the email.</p>}
      </div>

      {inCall && (
        <AuditCall auditId={id} callNumber={started} totalCalls={totalCalls} maxSeconds={maxSeconds} onDone={onCallDone} />
      )}
    </div>
  );
}
