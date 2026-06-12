"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { CoachChat } from "@/components/coach/CoachChat";
import { VoiceCoach } from "@/components/coach/VoiceCoach";

// The Coach entry point: first let the setter choose how they want to be
// coached (type it out vs talk it through), then route to the chat or a voice rep.
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

  const openVoice = (focus?: string) => setVoice({ open: true, focus });

  // The manager coach is chat-only for now (voice roleplay is phase 2) — skip
  // the chat-vs-voice chooser and go straight in.
  if (variant === "manager") {
    return (
      <div className="content">
        <CoachChat welcome={welcome} starters={starters} />
      </div>
    );
  }

  return (
    <div className="content">
      {mode === "choose" && (
        <div className="rise" style={{ maxWidth: 760, margin: "0 auto" }}>
          <p className="muted" style={{ fontSize: 15, marginBottom: 18 }}>{intro} How do you want to work with your coach?</p>
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
                <h3 style={{ fontSize: 20, marginBottom: 6 }}>Chat with your coach</h3>
                <p className="muted" style={{ fontSize: 14 }}>
                  Type it out. Get specific advice, better phrasing, and a breakdown of what to fix — at your own pace.
                </p>
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
                <h3 style={{ fontSize: 20, marginBottom: 6 }}>Talk to your coach</h3>
                <p className="muted" style={{ fontSize: 14 }}>
                  Practice out loud. Live role-play to rehearse the moment and lock it in. Uses your practice time.
                </p>
              </div>
              <div className="chip mint" style={{ marginTop: 16, width: "fit-content" }}>
                Start voice session <Icon name="arrow" size={13} />
              </div>
            </button>
          </div>
        </div>
      )}

      {mode === "chat" && <CoachChat sessionId={sessionId} welcome={welcome} starters={starters} onVoice={openVoice} />}

      {voice.open && (
        <VoiceCoach sessionId={sessionId} focus={voice.focus} onClose={() => setVoice({ open: false })} />
      )}
    </div>
  );
}
