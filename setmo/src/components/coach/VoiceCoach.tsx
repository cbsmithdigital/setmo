"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Icon } from "@/components/ui/Icon";
import { mmss } from "@/lib/format";

type Phase = "connecting" | "live" | "ended" | "error";

function Waveform({ active, bars = 36 }: { active: boolean; bars?: number }) {
  const seeds = useMemo(() => Array.from({ length: bars }, (_, i) => 0.2 + ((i * 31) % 80) / 100), [bars]);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 90 }}>
      {seeds.map((seed, i) => (
        <i
          key={i}
          style={{
            width: 5,
            borderRadius: 99,
            background: "linear-gradient(180deg,#a78bfa,#7c3aed)",
            height: active ? undefined : 12,
            animation: active ? `vcwf 1.1s ${(seed * 0.9).toFixed(2)}s ease-in-out infinite` : "none",
            opacity: active ? 1 : 0.4,
          }}
        />
      ))}
      <style>{`@keyframes vcwf{0%,100%{height:14px}50%{height:64px}}`}</style>
    </div>
  );
}

const COPY = {
  setter: {
    chip: "Setty",
    topic: "Practicing",
    endedTitle: "Nice rep!",
    endedSub: "Run it again any time — reps are how it sticks.",
    endBtn: "End practice",
    listening: "Listening — take it away",
  },
  manager: {
    chip: "Setty",
    topic: "Working on",
    endedTitle: "Good session",
    endedSub: "Come back any time to plan, brainstorm, or rehearse.",
    endBtn: "End session",
    listening: "Listening — go ahead",
  },
};

function Inner({
  sessionId,
  focus,
  onClose,
  mode = "setter",
}: {
  sessionId?: string;
  focus?: string;
  onClose: () => void;
  mode?: "setter" | "manager";
}) {
  const copy = COPY[mode];
  const [phase, setPhase] = useState<Phase>("connecting");
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | undefined>(focus);
  const started = useRef(false);

  const conversation = useConversation({
    micMuted: muted,
    onError: (m: string) => {
      setErr(typeof m === "string" ? m : "The voice coach hit an error.");
      setPhase("error");
    },
  });
  const status = conversation.status;
  const speaking = conversation.isSpeaking;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/coach/voice/connect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, focus }),
        });
        const cfg = await res.json();
        if (!res.ok) {
          setErr(cfg.error ?? "Couldn't start the voice coach.");
          setPhase("error");
          return;
        }
        if (!cfg.configured) {
          setErr("The voice coach agent isn't configured yet (set ELEVENLABS_COACH_AGENT_ID).");
          setPhase("error");
          return;
        }
        setTopic(cfg.focus ?? focus);
        conversation.startSession({
          signedUrl: cfg.signedUrl,
          connectionType: "websocket",
          overrides: { agent: { prompt: { prompt: cfg.systemPrompt }, firstMessage: cfg.firstMessage } },
          dynamicVariables: cfg.dynamicVariables,
          userId: cfg.setterId,
        });
        setSecs(0);
        setPhase("live");
      } catch {
        setErr("Couldn't reach the voice coach. Check mic permissions and try again.");
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

  const end = useCallback(() => {
    try {
      conversation.endSession();
    } catch {
      /* ignore */
    }
    setPhase("ended");
  }, [conversation]);

  const active = status === "connected" && !muted;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(6,6,12,.8)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 24 }}
    >
      <div className="card card-glow" style={{ width: "min(560px,94vw)", padding: 28, position: "relative" }}>
        <button onClick={() => { end(); onClose(); }} style={{ position: "absolute", top: 16, right: 16, color: "var(--muted)" }} aria-label="Close">
          <Icon name="x" size={20} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <span className="chip purple">
            <Icon name="chat" size={13} /> {copy.chip}
          </span>
          {phase === "live" && <span className="chip mint" style={{ padding: "3px 10px" }}><span className="live-dot" /> Live</span>}
        </div>
        {topic && (
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
            {copy.topic}: <span style={{ color: "var(--text-2)" }}>{topic.length > 140 ? topic.slice(0, 140) + "…" : topic}</span>
          </p>
        )}

        {phase === "error" ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <p className="banner error" style={{ marginBottom: 18 }}>{err}</p>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        ) : phase === "ended" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--grad-mint)", display: "grid", placeItems: "center", margin: "0 auto 16px", color: "#06281d" }}>
              <Icon name="check" size={26} sw={3} />
            </div>
            <h2 style={{ fontSize: 22, marginBottom: 8 }}>{copy.endedTitle}</h2>
            <p className="muted" style={{ marginBottom: 20 }}>{copy.endedSub}</p>
            <button className="btn btn-primary btn-lg" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ textAlign: "center", margin: "8px 0" }}>
              <div className="muted" style={{ fontSize: 13 }}>
                {phase === "connecting" ? "Connecting…" : speaking ? "Setty is speaking…" : muted ? "You're muted" : copy.listening}
              </div>
              <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 44, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", margin: "6px 0" }}>
                {mmss(secs)}
              </div>
            </div>
            <Waveform active={active || speaking} />
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 22 }}>
              <button
                className="btn btn-ghost"
                onClick={() => { const n = !muted; setMuted(n); conversation.setMuted(n); }}
                disabled={phase !== "live"}
                style={{ minWidth: 120, background: muted ? "rgba(239,68,68,.14)" : "var(--s3)", borderColor: muted ? "rgba(239,68,68,.4)" : "var(--line)", color: muted ? "#fca5a5" : "var(--text)" }}
              >
                <Icon name="mic" size={18} /> {muted ? "Muted" : "Mute"}
              </button>
              <button className="btn btn-primary" onClick={end} disabled={phase !== "live"}>
                {copy.endBtn}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function VoiceCoach(props: { sessionId?: string; focus?: string; onClose: () => void; mode?: "setter" | "manager" }) {
  return (
    <ConversationProvider>
      <Inner {...props} />
    </ConversationProvider>
  );
}
