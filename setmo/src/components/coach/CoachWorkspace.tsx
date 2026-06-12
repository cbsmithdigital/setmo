"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { CoachChat } from "@/components/coach/CoachChat";
import { VoiceCoach } from "@/components/coach/VoiceCoach";

const COPY = {
  setter: {
    prompt: "How do you want to work with your coach?",
    chatTitle: "Chat with your coach",
    chatDesc: "Type it out. Get specific advice, better phrasing, and a breakdown of what to fix — at your own pace.",
    voiceTitle: "Talk to your coach",
    voiceDesc: "Practice out loud. Live role-play to rehearse the moment and lock it in. Uses your practice time.",
  },
  manager: {
    prompt: "How do you want to work today?",
    chatTitle: "Chat with your coach",
    chatDesc: "Type it out. Diagnose the team, get a plan, assign trainings, and draft 1:1 notes — at your own pace.",
    voiceTitle: "Talk it through",
    voiceDesc: "Think out loud with your management assistant — brainstorm, plan the week, or rehearse a 1:1. Uses your practice time.",
  },
};

// The Coach entry point: choose how to work (type it out vs talk it through),
// then route to chat or a live voice session. Works for both the setter coach
// and the manager's management & training assistant (variant="manager").
export function CoachWorkspace({
  sessionId,
  intro,
  welcome,
  starters,
  variant = "setter",
}: {
  sessionId?: string;
  intro: string;
  welcome: string;
  starters: string[];
  variant?: "setter" | "manager";
}) {
  const [mode, setMode] = useState<"choose" | "chat">("choose");
  const [voice, setVoice] = useState<{ open: boolean; focus?: string }>({ open: false });
  const copy = COPY[variant];

  const openVoice = (focus?: string) => setVoice({ open: true, focus });

  return (
    <div className="content">
      {mode === "choose" && (
        <div className="rise" style={{ maxWidth: 760, margin: "0 auto" }}>
          <p className="muted" style={{ fontSize: 15, marginBottom: 18 }}>{intro} {copy.prompt}</p>
          <div className="grid g-2">
            <button
              className="card card-pad card-glow"
              style={{ textAlign: "left", minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
              onClick={() => setMode("chat")}
            >
              <div>
                <div style={{ width: 52, height: 52, borderRadius: 15, background: "var(--grad)", display: "grid", placeItems: "center", color: "#fff", marginBottom: 16, boxShadow: "var(--glow)" }}>
                  <Icon name="chat" size={26} />
                </div>
                <h3 style={{ fontSize: 20, marginBottom: 6 }}>{copy.chatTitle}</h3>
                <p className="muted" style={{ fontSize: 14 }}>{copy.chatDesc}</p>
              </div>
              <div className="chip purple" style={{ marginTop: 16, width: "fit-content" }}>
                Open chat <Icon name="arrow" size={13} />
              </div>
            </button>

            <button
              className="card card-pad card-glow"
              style={{ textAlign: "left", minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
              onClick={() => openVoice()}
            >
              <div>
                <div style={{ width: 52, height: 52, borderRadius: 15, background: "var(--grad-mint)", display: "grid", placeItems: "center", color: "#06281d", marginBottom: 16, boxShadow: "0 14px 36px -16px rgba(16,185,129,.6)" }}>
                  <Icon name="mic" size={26} />
                </div>
                <h3 style={{ fontSize: 20, marginBottom: 6 }}>{copy.voiceTitle}</h3>
                <p className="muted" style={{ fontSize: 14 }}>{copy.voiceDesc}</p>
              </div>
              <div className="chip mint" style={{ marginTop: 16, width: "fit-content" }}>
                Start voice session <Icon name="arrow" size={13} />
              </div>
            </button>
          </div>
        </div>
      )}

      {mode === "chat" && <CoachChat sessionId={sessionId} welcome={welcome} starters={starters} onVoice={openVoice} variant={variant} />}

      {voice.open && (
        <VoiceCoach sessionId={variant === "manager" ? undefined : sessionId} focus={voice.focus} mode={variant} onClose={() => setVoice({ open: false })} />
      )}
    </div>
  );
}
