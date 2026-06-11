"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function RecordingActions({
  sessionId,
  initialSaved,
  initialShareToken,
}: {
  sessionId: string;
  initialSaved: boolean;
  initialShareToken: string | null;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/shared/${shareToken}`
    : null;

  async function toggleSave() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ saved: !saved }),
      });
      if (res.ok) setSaved((s) => !s);
    } finally {
      setBusy(false);
    }
  }

  async function toggleShare() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !shareToken }),
      });
      const data = await res.json();
      if (res.ok) {
        setShareToken(data.shareToken ?? null);
        if (data.shareToken) setSaved(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className={"btn " + (saved ? "btn-mint" : "btn-ghost")}
          onClick={toggleSave}
          disabled={busy}
          style={{ padding: "9px 16px", fontSize: 14 }}
        >
          <Icon name={saved ? "check" : "spark"} size={16} /> {saved ? "Saved" : "Save recording"}
        </button>
        <button
          className={"btn " + (shareToken ? "btn-primary" : "btn-ghost")}
          onClick={toggleShare}
          disabled={busy}
          style={{ padding: "9px 16px", fontSize: 14 }}
        >
          <Icon name="send" size={16} /> {shareToken ? "Sharing on" : "Share for review"}
        </button>
      </div>

      {shareUrl && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" readOnly value={shareUrl} style={{ flex: 1, minWidth: 240, fontSize: 13 }} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn btn-ghost" onClick={copy} style={{ padding: "11px 16px", fontSize: 13.5 }}>
            <Icon name={copied ? "check" : "doc"} size={15} /> {copied ? "Copied" : "Copy link"}
          </button>
          <span className="muted" style={{ fontSize: 12, width: "100%" }}>
            Anyone with this link can view the scorecard, transcript, and recording — no login. Turn off sharing to revoke.
          </span>
        </div>
      )}
    </div>
  );
}
