"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuditCall } from "@/components/audit/AuditCall";

type CallState = "waiting" | "scoring" | "scored" | "empty";

const STATE_META: Record<CallState, { color: string; label: string; pulse?: boolean }> = {
  empty: { color: "var(--m-line)", label: "Not started" },
  waiting: { color: "#cbb6f0", label: "Waiting for transcript" },
  scoring: { color: "var(--m-amber)", label: "Scoring…", pulse: true },
  scored: { color: "var(--m-mint)", label: "Scored" },
};

export function AuditRunner({
  id,
  contactName,
  totalCalls,
  maxSeconds,
  initialCalls,
}: {
  id: string;
  contactName: string;
  totalCalls: number;
  maxSeconds: number;
  initialCalls: CallState[];
}) {
  const router = useRouter();
  const [calls, setCalls] = useState<CallState[]>(initialCalls);
  const [inCall, setInCall] = useState(false);
  const [invite, setInvite] = useState("");
  const [invited, setInvited] = useState<"idle" | "ok" | "err">("idle");

  const started = calls.length; // sessions created so far
  const scored = calls.filter((c) => c === "scored").length;
  const scoring = calls.filter((c) => c === "scoring").length;
  const callsLeft = totalCalls - started;
  const done = scored >= totalCalls;

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/audit/${id}/status`);
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.calls)) setCalls(d.calls);
      if (d.status === "SCORED") router.refresh();
    } catch {
      /* ignore */
    }
  }, [id, router]);

  // Poll so the bars update as transcripts capture + scores land. When all 5 are
  // scored, poll() calls router.refresh() → the page re-renders the report and
  // unmounts this runner, which clears the interval.
  useEffect(() => {
    const t = setInterval(poll, 4000);
    const kick = setTimeout(poll, 400);
    return () => { clearInterval(t); clearTimeout(kick); };
  }, [poll]);

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
      {/* per-call status bars */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        {Array.from({ length: totalCalls }, (_, i) => {
          const st: CallState = calls[i] ?? "empty";
          const m = STATE_META[st];
          return (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 8, borderRadius: 999, background: st === "empty" ? "var(--m-line)" : m.color, opacity: st === "empty" ? 0.5 : 1, animation: m.pulse ? "mkt-pulsebar 1.2s ease-in-out infinite" : "none" }} />
              <div style={{ fontSize: 10.5, marginTop: 6, color: st === "scored" ? "var(--mint-deep)" : st === "scoring" ? "#b8821f" : "var(--m-muted)", fontWeight: st === "empty" ? 400 : 600 }}>
                {st === "empty" ? `Call ${i + 1}` : m.label}
              </div>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes mkt-pulsebar{0%,100%{opacity:.55}50%{opacity:1}}`}</style>

      <h3 style={{ fontSize: 23, margin: "18px 0 8px" }}>
        {done ? "Scoring complete — building your report…" : `Hi ${contactName.split(" ")[0]} — let's run your 5 calls.`}
      </h3>
      <p style={{ color: "var(--m-muted)", fontSize: 15, marginBottom: 22 }}>
        {scored}/{totalCalls} scored{scoring > 0 ? ` · ${scoring} scoring now (a minute or two each)` : ""}. Each call is a realistic AI lead — talk to it like a real inbound. Under 12 minutes each.
      </p>

      {!done && callsLeft > 0 && (
        <button
          className="btn btn-primary btn-block"
          onClick={() => setInCall(true)}
          disabled={inCall}
          style={{ marginBottom: 14 }}
        >
          {inCall ? "On a call…" : started === 0 ? "Start my first call" : `Start call ${started + 1} of ${totalCalls}`}
        </button>
      )}
      {!done && callsLeft <= 0 && scoring > 0 && (
        <p className="audit-note" style={{ textAlign: "center" }}>All 5 calls are in — finishing scoring now. This page updates automatically.</p>
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
        <AuditCall auditId={id} callNumber={started + 1} totalCalls={totalCalls} maxSeconds={maxSeconds} onDone={() => { setInCall(false); poll(); }} />
      )}
    </div>
  );
}
