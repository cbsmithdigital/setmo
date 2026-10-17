"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuditCall, useDevice } from "@/components/audit/AuditCall";

type CallState = "waiting" | "scoring" | "scored" | "empty";

const STATE_META: Record<CallState, { color: string; label: string; pulse?: boolean }> = {
  empty: { color: "var(--m-line)", label: "Not started" },
  waiting: { color: "#cbb6f0", label: "Finishing up…" },
  scoring: { color: "var(--m-amber)", label: "Scoring…", pulse: true },
  scored: { color: "var(--m-mint)", label: "Scored" },
};

const linkStyle = { color: "var(--purple-deep)", fontWeight: 600 };

export function AuditRunner({
  id,
  contactName,
  totalCalls,
  maxSeconds,
  initialCalls,
  initialAttemptsLeft,
  maxAttempts,
  initialTooShort,
}: {
  id: string;
  contactName: string;
  totalCalls: number;
  maxSeconds: number;
  initialCalls: CallState[];
  initialAttemptsLeft: number;
  maxAttempts: number;
  initialTooShort: boolean;
}) {
  const router = useRouter();
  const device = useDevice();
  const [calls, setCalls] = useState<CallState[]>(initialCalls);
  const [attemptsLeft, setAttemptsLeft] = useState(initialAttemptsLeft);
  const [tooShort, setTooShort] = useState(initialTooShort);
  const [inCall, setInCall] = useState(false);
  // Fixed when the call starts: the count below moves as soon as it connects.
  const [callNumber, setCallNumber] = useState(1);
  const [invite, setInvite] = useState("");
  const [invited, setInvited] = useState<"idle" | "ok" | "err">("idle");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const started = calls.length; // calls that connected so far
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
      if (typeof d.attemptsLeft === "number") setAttemptsLeft(d.attemptsLeft);
      if (typeof d.tooShort === "boolean") setTooShort(d.tooShort);
      if (d.status === "SCORED") router.refresh();
    } catch {
      /* ignore */
    }
  }, [id, router]);

  // Poll so the bars update as transcripts capture + scores land. When the call
  // is scored, poll() calls router.refresh() → the page re-renders the report
  // and unmounts this runner, which clears the interval.
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
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInviteMsg(j.error ?? "Couldn't send — check the email.");
      setInvited("err");
      return;
    }
    if (!j.emailed && !j.link) {
      setInviteMsg("The email didn't go out — try again in a minute.");
      setInvited("err");
      return;
    }
    // Created, but the email didn't go out: hand them the link instead.
    setInviteMsg(j.link ? `The email didn't go out — send them this link: ${j.link}` : "Sent — they can run the call from that link.");
    setInvited("ok");
    setInvite("");
  }

  function startCall() {
    setCallNumber(started + 1);
    setInCall(true);
  }

  const outOfTries = !done && callsLeft > 0 && attemptsLeft <= 0;

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
        {done
          ? "Scoring complete — building your report…"
          : callsLeft <= 0
            ? `Thanks, ${contactName.split(" ")[0]} — ${totalCalls === 1 ? "your call is in" : "your calls are in"}.`
            : `Hi ${contactName.split(" ")[0]} — let's run your ${totalCalls === 1 ? "call" : `${totalCalls} calls`}.`}
      </h3>
      <p style={{ color: "var(--m-muted)", fontSize: 15, marginBottom: 22 }}>
        {totalCalls === 1
          ? "It's a realistic AI lead — talk to it like a real inbound. Up to 12 minutes."
          : `${scored}/${totalCalls} scored${scoring > 0 ? ` · ${scoring} scoring now (a minute or two each)` : ""}. Each call is a realistic AI lead — talk to it like a real inbound. Under 12 minutes each.`}
      </p>

      {/* the last call was too short to score (lib/ingest closed it out): under
          a minute, or the prospect barely spoke */}
      {tooShort && !done && callsLeft > 0 && !inCall && !outOfTries && (
        <div className="banner ok">Your last call was too short to score: under a minute, or we barely heard you. It didn&apos;t use up your free call. Check your mic or headset, then call again.</div>
      )}

      {outOfTries ? (
        <p className="audit-note" style={{ textAlign: "center", marginBottom: 14 }}>
          You&apos;ve used all your tries. Email <a href="mailto:hello@growdental.ai" style={linkStyle}>hello@growdental.ai</a> and we&apos;ll set you up.
        </p>
      ) : (
        !done && callsLeft > 0 && (
          <>
            <p className="audit-note" style={{ textAlign: "center", margin: "0 0 10px" }}>
              🎙️ {device.touch ? "Headphones work best — on speaker, the lead can hear itself." : "SetMo needs your microphone for this call. A headset or a quiet room works best."}
            </p>
            <button
              className="btn btn-primary btn-block"
              onClick={startCall}
              disabled={inCall}
              style={{ marginBottom: 10 }}
            >
              {inCall ? "On a call…" : totalCalls === 1 ? "Allow mic & start my call" : started === 0 ? "Start my first call" : `Start call ${started + 1} of ${totalCalls}`}
            </button>
            <p className="audit-note" style={{ textAlign: "center", margin: "0 0 14px" }}>
              By continuing you agree to the <Link href="/terms" target="_blank" style={linkStyle}>Terms</Link> and <Link href="/privacy" target="_blank" style={linkStyle}>Privacy Policy</Link>. Your call is recorded and scored.
            </p>
            {attemptsLeft < maxAttempts && (
              <p className="audit-note" style={{ textAlign: "center", margin: "0 0 14px" }}>
                You have {attemptsLeft} {attemptsLeft === 1 ? "try" : "tries"} left.
              </p>
            )}
          </>
        )
      )}
      {!done && callsLeft <= 0 && (
        <p className="audit-note" style={{ textAlign: "center" }}>
          {scoring > 0 ? "Scoring it now — about a minute." : "Finishing up."} This page updates automatically.
        </p>
      )}

      {/* invite a setter to run the calls instead */}
      <div style={{ borderTop: "1px solid var(--m-line)", marginTop: 18, paddingTop: 18 }}>
        <label className="hint" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)" }}>Want your setter to run it instead?</label>
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <input type="email" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="setter@yourpractice.com" style={{ flex: 1, minWidth: 200 }} />
          <button className="btn btn-ghost" onClick={sendInvite} type="button">Send link</button>
        </div>
        {invited === "ok" && <p className="audit-note" style={{ color: "var(--mint-deep)", wordBreak: "break-all" }}>{inviteMsg}</p>}
        {invited === "err" && <p className="audit-note" style={{ color: "#b42318" }}>{inviteMsg}</p>}
      </div>

      {inCall && (
        <AuditCall auditId={id} callNumber={callNumber} totalCalls={totalCalls} maxSeconds={maxSeconds} onDone={() => { setInCall(false); poll(); }} />
      )}
    </div>
  );
}
