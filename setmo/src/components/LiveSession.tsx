"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Icon } from "@/components/ui/Icon";
import { mmss } from "@/lib/format";

type Phase = "pre" | "live" | "wrap" | "error";

// --- animated voice bars ---
function Waveform({ active, bars = 44 }: { active: boolean; bars?: number }) {
  // Deterministic per-bar delay seeds (stable across renders + hydration-safe).
  const seeds = useMemo(
    () => Array.from({ length: bars }, (_, i) => 0.2 + ((i * 37) % 80) / 100),
    [bars]
  );
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, height: 120 }}>
      {seeds.map((seed, i) => (
        <i
          key={i}
          style={{
            width: 6,
            borderRadius: 99,
            background: "linear-gradient(180deg,#a78bfa,#7c3aed)",
            height: active ? undefined : 14,
            animation: active ? `wf 1.1s ${(seed * 0.9).toFixed(2)}s ease-in-out infinite` : "none",
            opacity: active ? 1 : 0.4,
          }}
        />
      ))}
      <style>{`@keyframes wf{0%,100%{height:16px}50%{height:78px}}`}</style>
    </div>
  );
}

function SessionInner({
  sessionId,
  serviceLabel,
  remainingMinutes,
}: {
  sessionId: string;
  serviceLabel: string;
  remainingMinutes: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("pre");
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [wrapNote, setWrapNote] = useState("Grading 8 skills and writing your feedback.");
  const [personaName, setPersonaName] = useState<string | null>(null);

  const conversation = useConversation({
    micMuted: muted,
    onError: (msg: string) => {
      setErrMsg(typeof msg === "string" ? msg : "The call hit an error.");
      setPhase("error");
    },
  });

  const status = conversation.status;
  const speaking = conversation.isSpeaking;

  // elapsed timer while live
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // poll for the scored result while wrapping up
  useEffect(() => {
    if (phase !== "wrap") return;
    let tries = 0;
    const poll = setInterval(async () => {
      tries++;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/result`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "scored") {
            clearInterval(poll);
            router.push(`/results/${sessionId}`);
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      if (tries > 72) {
        clearInterval(poll);
        setWrapNote("Still scoring — your result will appear on your dashboard shortly.");
      }
    }, 2500);
    return () => clearInterval(poll);
  }, [phase, sessionId, router]);

  const startCall = useCallback(async () => {
    setErrMsg(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/connect`, { method: "POST" });
      const cfg = await res.json();
      if (!res.ok) {
        setErrMsg(cfg.error ?? "Couldn't connect the call.");
        setPhase("error");
        return;
      }
      if (!cfg.configured) {
        setErrMsg(
          "The voice agent isn't configured yet. Add ELEVENLABS_API_KEY and ELEVENLABS_AGENT_IMPLANT to .env.local to run a live call."
        );
        setPhase("error");
        return;
      }
      setPersonaName(cfg.personaName ?? null);
      conversation.startSession({
        signedUrl: cfg.signedUrl,
        connectionType: "websocket",
        dynamicVariables: cfg.dynamicVariables,
        userId: cfg.setterId,
        ...(cfg.systemPrompt || cfg.voiceId
          ? {
              overrides: {
                ...(cfg.systemPrompt ? { agent: { prompt: { prompt: cfg.systemPrompt }, firstMessage: cfg.firstMessage } } : {}),
                ...(cfg.voiceId ? { tts: { voiceId: cfg.voiceId } } : {}),
              },
            }
          : {}),
      });
      setSecs(0);
      setPhase("live");
    } catch {
      setErrMsg("Couldn't connect the call. Check your mic permissions and try again.");
      setPhase("error");
    }
  }, [conversation, sessionId]);

  const endCall = useCallback(async () => {
    let conversationId: string | undefined;
    try {
      conversationId = conversation.getId();
    } catch {
      /* not connected */
    }
    try {
      conversation.endSession();
    } catch {
      /* ignore */
    }
    setPhase("wrap");
    try {
      await fetch(`/api/sessions/${sessionId}/ended`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
    } catch {
      /* the webhook is authoritative regardless */
    }
  }, [conversation, sessionId]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    conversation.setMuted(next);
  }

  // ---------- ERROR ----------
  if (phase === "error") {
    return (
      <Centered>
        <div className="rise" style={{ textAlign: "center", maxWidth: 460 }}>
          <h2 style={{ fontSize: 24, marginBottom: 12 }}>Couldn&apos;t run the call</h2>
          <p className="muted" style={{ marginBottom: 24 }}>{errMsg}</p>
          <button className="btn btn-ghost btn-lg" onClick={() => router.push("/practice")}>
            Back to practice
          </button>
        </div>
      </Centered>
    );
  }

  // ---------- WRAP ----------
  if (phase === "wrap") {
    return (
      <Centered>
        <div style={{ textAlign: "center" }} className="rise">
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 22px",
              borderRadius: "50%",
              border: "3px solid var(--s3)",
              borderTopColor: "var(--purple)",
              animation: "spin .9s linear infinite",
            }}
          />
          <h2 style={{ fontSize: 26, marginBottom: 8 }}>Scoring your call…</h2>
          <p className="muted">{wrapNote}</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </Centered>
    );
  }

  // ---------- PRE-CALL ----------
  if (phase === "pre") {
    return (
      <Centered>
        <div className="rise" style={{ textAlign: "center", maxWidth: 480 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              margin: "0 auto 28px",
              display: "grid",
              placeItems: "center",
              background: "radial-gradient(circle,rgba(139,92,246,.25),transparent 70%)",
              border: "1px solid rgba(139,92,246,.4)",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--grad)",
                display: "grid",
                placeItems: "center",
                boxShadow: "var(--glow)",
              }}
            >
              <Icon name="mic" size={28} color="#fff" />
            </div>
          </div>
          <div className="chip purple" style={{ marginBottom: 18 }}>
            {serviceLabel} · adaptive
          </div>
          <h1 style={{ fontSize: 34, marginBottom: 16, lineHeight: 1.12 }}>You&apos;re calling a new lead.</h1>
          <p className="muted" style={{ fontSize: 16, maxWidth: "26em", margin: "0 auto 8px" }}>
            You won&apos;t know who picks up — that&apos;s the point. Stay warm, listen for the real
            reason they called, and lead them to a booked appointment.
          </p>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--faint)",
              margin: "18px 0 26px",
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="mic" size={15} /> SetMo needs your microphone for this call.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn btn-ghost btn-lg" onClick={() => router.push("/practice")}>
              Back
            </button>
            <button className="btn btn-primary btn-lg" onClick={startCall}>
              <Icon name="mic" /> Allow mic &amp; start call
            </button>
          </div>
        </div>
      </Centered>
    );
  }

  // ---------- LIVE ----------
  const active = status === "connected" && !muted;
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", zIndex: 1, overflowX: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 32px" }}>
        <div className="chip mint" style={{ padding: "7px 14px", fontSize: 13 }}>
          <span className="live-dot" /> {status === "connected" ? "LIVE PRACTICE" : "CONNECTING…"}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="chip">
            <Icon name="clock" size={14} /> {Math.max(0, Math.round(remainingMinutes))} min left in pool
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 24 }}>
        <div
          style={{
            position: "absolute",
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: "radial-gradient(circle,rgba(139,92,246,.18),transparent 65%)",
            pointerEvents: "none",
          }}
        />
        <div className="muted" style={{ fontSize: 14, position: "relative" }}>
          {status === "connected" ? "On the call with" : "Calling"} {personaName ?? "a new lead"}
        </div>
        <div
          style={{
            fontFamily: "var(--font-lato)",
            fontWeight: 900,
            fontSize: 64,
            letterSpacing: "-0.04em",
            position: "relative",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {mmss(secs)}
        </div>
        <div style={{ maxWidth: 560, width: "100%", position: "relative", margin: "10px 0" }}>
          <Waveform active={active || speaking} />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            position: "relative",
            color: "var(--text-2)",
            fontSize: 15,
            background: "var(--s2)",
            border: "1px solid var(--line)",
            padding: "11px 18px",
            borderRadius: 99,
            maxWidth: "34em",
            textAlign: "center",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 9, background: "var(--purple-2)", flex: "none" }} />
          <span>
            {muted
              ? "You're muted — unmute to keep talking"
              : speaking
                ? "The lead is speaking…"
                : "Listening — take the lead."}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 24px 44px", position: "relative" }}>
        <button
          className="btn btn-ghost btn-lg"
          onClick={toggleMute}
          style={{
            minWidth: 130,
            background: muted ? "rgba(239,68,68,.14)" : "var(--s3)",
            borderColor: muted ? "rgba(239,68,68,.4)" : "var(--line)",
            color: muted ? "#fca5a5" : "var(--text)",
          }}
        >
          <Icon name="mic" size={18} /> {muted ? "Muted" : "Mute"}
        </button>
        <button className="btn btn-primary btn-lg" onClick={endCall} style={{ padding: "16px 34px" }}>
          End call &amp; get feedback <Icon name="arrow" />
        </button>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", position: "relative", zIndex: 1, padding: 24 }}>
      {children}
    </div>
  );
}

export function LiveSession(props: {
  sessionId: string;
  serviceLabel: string;
  remainingMinutes: number;
}) {
  return (
    <>
      <div className="app-bg" />
      <ConversationProvider>
        <SessionInner {...props} />
      </ConversationProvider>
    </>
  );
}
