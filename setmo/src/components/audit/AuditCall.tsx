"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { mmss } from "@/lib/format";

type Phase = "connecting" | "live" | "ended" | "error";

function Wave({ active }: { active: boolean }) {
  const seeds = useMemo(() => Array.from({ length: 32 }, (_, i) => 0.2 + ((i * 31) % 80) / 100), []);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 80 }}>
      {seeds.map((s, i) => (
        <i key={i} style={{ width: 5, borderRadius: 99, background: "linear-gradient(180deg,#a78bfa,#7c3aed)", height: active ? undefined : 12, animation: active ? `acw 1.1s ${(s * 0.9).toFixed(2)}s ease-in-out infinite` : "none", opacity: active ? 1 : 0.4 }} />
      ))}
      <style>{`@keyframes acw{0%,100%{height:14px}50%{height:58px}}`}</style>
    </div>
  );
}

function Inner({ auditId, callNumber, totalCalls, maxSeconds, onDone }: { auditId: string; callNumber: number; totalCalls: number; maxSeconds: number; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  const conversation = useConversation({
    onError: (m: string) => { setErr(typeof m === "string" ? m : "The call hit an error."); setPhase("error"); },
  });
  const speaking = conversation.isSpeaking;

  const end = useCallback(() => {
    try { conversation.endSession(); } catch { /* ignore */ }
    setPhase("ended");
  }, [conversation]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/audit/${auditId}/connect`, { method: "POST" });
        const cfg = await res.json();
        if (!res.ok) { setErr(cfg.error ?? "Couldn't start the call."); setPhase("error"); return; }
        if (!cfg.configured) { setErr("Voice calls aren't configured yet."); setPhase("error"); return; }
        conversation.startSession({ signedUrl: cfg.signedUrl, connectionType: "websocket", dynamicVariables: cfg.dynamicVariables, userId: cfg.setterId });
        setSecs(0);
        setPhase("live");
      } catch {
        setErr("Couldn't reach the call. Check mic permissions and try again.");
        setPhase("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick + hard cap each audit call.
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (phase === "live" && secs >= maxSeconds) {
      const t = setTimeout(end, 0);
      return () => clearTimeout(t);
    }
  }, [phase, secs, maxSeconds, end]);

  const remaining = Math.max(0, maxSeconds - secs);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(6,6,12,.85)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(540px,94vw)", background: "#0d0d18", border: "1px solid #20203a", borderRadius: 24, padding: 28, color: "#e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#94a3b8" }}>Audit call {callNumber} of {totalCalls}</span>
          {phase === "live" && <span style={{ fontSize: 12.5, color: "#34d399", fontWeight: 600 }}>● Live · {mmss(remaining)} left</span>}
        </div>

        {phase === "error" ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <p style={{ background: "#3a1212", border: "1px solid #6b2525", color: "#fca5a5", borderRadius: 12, padding: "12px 14px", marginBottom: 18, fontSize: 14 }}>{err}</p>
            <button className="btn btn-ghost" onClick={onDone} style={{ background: "#1a1a2e", color: "#e2e8f0", border: "1px solid #2a2a45", borderRadius: 999, padding: "11px 20px" }}>Close</button>
          </div>
        ) : phase === "ended" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg,#34d399,#10b981)", display: "grid", placeItems: "center", margin: "0 auto 14px", color: "#06281d", fontWeight: 900, fontSize: 26 }}>✓</div>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>Call {callNumber} done</h2>
            <p style={{ color: "#94a3b8", marginBottom: 20, fontSize: 14.5 }}>Scoring it now — this takes a few seconds.</p>
            <button onClick={onDone} style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "#fff", border: "none", borderRadius: 999, padding: "12px 24px", fontWeight: 600, cursor: "pointer" }}>Continue</button>
          </div>
        ) : (
          <>
            <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 2 }}>Implant / full-arch lead · undisclosed persona</div>
            <div style={{ textAlign: "center", margin: "10px 0" }}>
              <div style={{ color: "#94a3b8", fontSize: 13 }}>{phase === "connecting" ? "Connecting…" : speaking ? "Lead is speaking…" : "Listening — take the call"}</div>
              <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 42, fontVariantNumeric: "tabular-nums", margin: "6px 0" }}>{mmss(secs)}</div>
            </div>
            <Wave active={phase === "live"} />
            <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
              <button onClick={end} disabled={phase !== "live"} style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "#fff", border: "none", borderRadius: 999, padding: "13px 28px", fontWeight: 600, cursor: "pointer", opacity: phase === "live" ? 1 : 0.6 }}>
                End call &amp; score it
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AuditCall(props: { auditId: string; callNumber: number; totalCalls: number; maxSeconds: number; onDone: () => void }) {
  return (
    <ConversationProvider>
      <Inner {...props} />
    </ConversationProvider>
  );
}
