"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type Action = { type: string; summary: string };
type Turn = { role: "user" | "assistant"; content: string; actions?: Action[] };

export function CoachChat({
  sessionId,
  welcome,
  starters,
  onVoice,
  variant = "setter",
}: {
  sessionId?: string;
  welcome: string;
  starters: string[];
  onVoice?: (focus?: string) => void;
  variant?: "setter" | "manager" | "group";
}) {
  const [convo, setConvo] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [convo, loading]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setErr(null);
    const next = [...convo, { role: "user" as const, content }];
    setConvo(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, messages: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Coach is unavailable right now.");
        setLoading(false);
        return;
      }
      setConvo((c) => [...c, { role: "assistant", content: data.reply || "…", actions: data.actions ?? [] }]);
    } catch {
      setErr("Couldn't reach the coach. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const bubble = (role: Turn["role"]) =>
    role === "user"
      ? { alignSelf: "flex-end" as const, background: "var(--grad)", color: "#fff" }
      : { alignSelf: "flex-start" as const, background: "var(--s3)", color: "var(--text)" };

  return (
    <div className="card card-pad coach-chat-card" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", minHeight: 460 }}>
      {onVoice && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 13.5 }} onClick={() => onVoice()}>
            <Icon name="mic" size={16} /> Switch to voice coach
          </button>
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 }}>
        {/* coach welcome */}
        <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: "var(--grad)", display: "grid", placeItems: "center", color: "#fff", flex: "none" }}>
            <Icon name="chat" size={17} />
          </div>
          <div className="card" style={{ background: "var(--s3)", padding: "12px 15px", maxWidth: "78%", fontSize: 14.5, lineHeight: 1.5 }}>
            {welcome}
          </div>
        </div>

        {convo.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 6 }}>
            <div
              className="card"
              style={{ ...bubble(m.role), padding: "12px 15px", maxWidth: "78%", fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap", border: "none" }}
            >
              {m.content}
            </div>
            {m.role === "assistant" && m.actions && m.actions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {m.actions.map((a, j) => (
                  <span key={j} className="chip mint" style={{ fontSize: 12 }}>
                    <Icon name="check" size={13} sw={3} /> {a.summary}
                  </span>
                ))}
              </div>
            )}
            {m.role === "assistant" && onVoice && variant === "setter" && (
              <button
                onClick={() => onVoice(m.content)}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--purple-2)", padding: "2px 4px" }}
              >
                <Icon name="mic" size={14} /> Practice this with your voice coach
              </button>
            )}
          </div>
        ))}

        {loading && (
          <div className="muted" style={{ fontSize: 13.5, paddingLeft: 45 }}>
            Setty is thinking…
          </div>
        )}
        {err && <div className="banner error">{err}</div>}
      </div>

      {convo.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0 10px" }}>
          {starters.map((s) => (
            <button key={s} className="chip" style={{ cursor: "pointer" }} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{ display: "flex", gap: 10, marginTop: 12 }}
      >
        <input
          className="input"
          placeholder="Ask your coach…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" type="submit" disabled={loading || !input.trim()}>
          <Icon name="send" size={17} />
        </button>
      </form>
    </div>
  );
}
