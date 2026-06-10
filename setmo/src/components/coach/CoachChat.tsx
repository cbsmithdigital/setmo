"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type Turn = { role: "user" | "assistant"; content: string };

export function CoachChat({
  sessionId,
  welcome,
  starters,
}: {
  sessionId?: string;
  welcome: string;
  starters: string[];
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
      setConvo((c) => [...c, { role: "assistant", content: data.reply || "…" }]);
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
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", minHeight: 460 }}>
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
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              className="card"
              style={{ ...bubble(m.role), padding: "12px 15px", maxWidth: "78%", fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap", border: "none" }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="muted" style={{ fontSize: 13.5, paddingLeft: 45 }}>
            Coach is thinking…
          </div>
        )}
        {err && <div className="banner error">{err}</div>}
      </div>

      {/* starters */}
      {convo.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0 10px" }}>
          {starters.map((s) => (
            <button key={s} className="chip" style={{ cursor: "pointer" }} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* input */}
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
