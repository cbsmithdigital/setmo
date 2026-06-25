"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { mmss } from "@/lib/format";

type Phase = "connecting" | "live" | "ended" | "error";
const MAX_SECONDS = 20 * 60; // generous safety cap

function Inner({ auditId, onClose }: { auditId: string; onClose: () => void }) {
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
        const res = await fetch(`/api/audit/${auditId}/setty`, { method: "POST" });
        const cfg = await res.json();
        if (!res.ok) { setErr(cfg.error ?? "Couldn't start Setty."); setPhase("error"); return; }
        if (!cfg.configured) { setErr("Setty isn't available right now — reach us at hello@growdental.ai."); setPhase("error"); return; }
        conversation.startSession({
          signedUrl: cfg.signedUrl,
          connectionType: "websocket",
          dynamicVariables: cfg.dynamicVariables,
          overrides: { agent: { prompt: { prompt: cfg.systemPrompt }, firstMessage: cfg.firstMessage } },
        });
        setSecs(0);
        setPhase("live");
      } catch {
        setErr("Couldn't reach Setty. Check mic permissions and try again.");
        setPhase("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (phase === "live" && secs >= MAX_SECONDS) {
      const t = setTimeout(end, 0);
      return () => clearTimeout(t);
    }
  }, [phase, secs, end]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(6,6,12,.85)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(460px,94vw)", background: "#0d0d18", border: "1px solid #20203a", borderRadius: 24, padding: 28, color: "#e2e8f0", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", display: "grid", placeItems: "center", margin: "0 auto 14px", fontSize: 30 }}>🎙️</div>
        <h2 style={{ fontSize: 22, marginBottom: 6 }}>Setty</h2>

        {phase === "error" ? (
          <>
            <p style={{ background: "#3a1212", border: "1px solid #6b2525", color: "#fca5a5", borderRadius: 12, padding: "12px 14px", margin: "12px 0 18px", fontSize: 14 }}>{err}</p>
            <button onClick={onClose} style={{ background: "#1a1a2e", color: "#e2e8f0", border: "1px solid #2a2a45", borderRadius: 999, padding: "11px 22px", cursor: "pointer" }}>Close</button>
          </>
        ) : phase === "ended" ? (
          <>
            <p style={{ color: "#94a3b8", margin: "8px 0 20px", fontSize: 14.5 }}>Thanks for chatting. Ready when you are — activate SetMo right on this page.</p>
            <button onClick={onClose} style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "#fff", border: "none", borderRadius: 999, padding: "12px 24px", fontWeight: 600, cursor: "pointer" }}>Done</button>
          </>
        ) : (
          <>
            <div style={{ color: "#94a3b8", fontSize: 14, marginBottom: 4 }}>
              {phase === "connecting" ? "Connecting…" : speaking ? "Setty is speaking…" : "Listening — go ahead"}
            </div>
            <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 30, fontVariantNumeric: "tabular-nums", margin: "4px 0 16px" }}>{mmss(secs)}</div>
            <button onClick={end} disabled={phase !== "live"} style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "#fff", border: "none", borderRadius: 999, padding: "13px 28px", fontWeight: 600, cursor: "pointer", opacity: phase === "live" ? 1 : 0.6 }}>
              End chat
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function SettyConversation(props: { auditId: string; onClose: () => void }) {
  return (
    <ConversationProvider>
      <Inner {...props} />
    </ConversationProvider>
  );
}
