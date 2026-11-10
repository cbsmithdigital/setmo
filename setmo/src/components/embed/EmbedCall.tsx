"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LiveSession } from "@/components/LiveSession";
import { EmbedResults, type EmbedResult } from "@/components/embed/EmbedResults";

// A practice call inside a partner's app (an iframe). The call screen is
// SetMo's own; this wrapper tells the partner's page what's happening, and
// shows the results in place when the score lands. The partner's colors (accent,
// and a light or dark background) are set for the whole page by the embed page
// itself (lib/embed-theme), so they apply from the first paint.
//
// Messages to the parent page (window.postMessage, only to the partner's
// registered sites):  { source: "setmo", type, sessionId, ...data }
//   ready · lead.ready · call.started · call.dropped · call.ended · mic.denied ·
//   results.ready · call.failed · error
// The parent can send { type: "setmo:end-call" } to end a live call.

export function EmbedCall({
  sessionId,
  frameToken,
  serviceLabel,
  origins,
}: {
  sessionId: string;
  frameToken: string;
  serviceLabel: string;
  origins: string[];
}) {
  const [result, setResult] = useState<EmbedResult | null>(null);
  const [endSignal, setEndSignal] = useState(0);

  const notify = useCallback(
    (type: string, data?: Record<string, unknown>) => {
      if (typeof window === "undefined" || window.parent === window) return;
      const msg = { source: "setmo", type, sessionId, ...(data ?? {}) };
      for (const origin of origins) {
        try {
          window.parent.postMessage(msg, origin);
        } catch {
          /* not that origin */
        }
      }
    },
    [origins, sessionId]
  );

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!origins.includes(e.origin)) return;
      const type = (e.data as { type?: unknown } | null)?.type;
      if (type === "setmo:end-call") setEndSignal((n) => n + 1);
    };
    window.addEventListener("message", onMessage);
    notify("ready");
    return () => window.removeEventListener("message", onMessage);
  }, [origins, notify]);

  const embed = useMemo(
    () => ({ token: frameToken, notify, onScored: (r: unknown) => setResult(r as EmbedResult), endSignal }),
    [frameToken, notify, endSignal]
  );

  return (
    <div className="embed-root">
      {result ? (
        <>
          <div className="app-bg" />
          <EmbedResults r={result} />
        </>
      ) : (
        <LiveSession sessionId={sessionId} serviceLabel={serviceLabel} remainingMinutes={0} embed={embed} />
      )}
    </div>
  );
}

/** When the launch link can't be used. */
export function EmbedNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="embed-root">
      <div className="app-bg" />
      <div className="call-centered">
        <div className="rise" style={{ textAlign: "center", maxWidth: 440 }}>
          <h2 style={{ fontSize: 22, marginBottom: 10 }}>{title}</h2>
          <p className="muted">{body}</p>
        </div>
      </div>
    </div>
  );
}
