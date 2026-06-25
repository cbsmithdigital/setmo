"use client";

import { useState } from "react";
import { SettyConversation } from "@/components/audit/SettyConversation";

// Floating "Talk to Setty" launcher on the audit results page → opens the
// briefed ElevenLabs voice session.
export function SettyButton({ auditId, practiceName }: { auditId: string; practiceName: string }) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(false);

  return (
    <>
      {open && !live && (
        <div className="audit-card" style={{ position: "fixed", right: 20, bottom: 90, width: "min(360px, 92vw)", zIndex: 60, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--m-grad)", display: "grid", placeItems: "center", color: "#fff", flex: "none" }}>🎙️</div>
            <div>
              <div style={{ fontWeight: 800, fontFamily: "var(--font-lato)" }}>Setty</div>
              <div style={{ fontSize: 12, color: "var(--m-muted)" }}>Your SetMo guide</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", color: "var(--m-muted)", fontSize: 20, lineHeight: 1 }} aria-label="Close">×</button>
          </div>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 14 }}>
            I&apos;ve read {practiceName}&apos;s call. Ask me anything about your results, how SetMo works, what it can do for your team, or the best way to get started — I can talk you through it.
          </p>
          <button className="btn btn-primary btn-block" onClick={() => setLive(true)}>
            Start voice chat
          </button>
          <p style={{ fontSize: 11.5, color: "var(--m-muted)", textAlign: "center", marginTop: 8 }}>Uses your mic · free, no account needed</p>
        </div>
      )}

      {live && <SettyConversation auditId={auditId} onClose={() => { setLive(false); setOpen(false); }} />}

      <button
        onClick={() => setOpen((o) => !o)}
        className="btn btn-primary"
        style={{ position: "fixed", right: 20, bottom: 20, zIndex: 60, borderRadius: 999, boxShadow: "0 12px 32px rgba(124,58,237,.45)", padding: "12px 20px" }}
      >
        🎙️ Talk to Setty
      </button>
    </>
  );
}
