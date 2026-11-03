"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { LiveSession } from "@/components/LiveSession";
import { EmbedResults, type EmbedResult } from "@/components/embed/EmbedResults";

// A practice call inside a partner's app (an iframe). The call screen is
// SetMo's own; this wrapper adds the partner's accent color, tells the partner's
// page what's happening, and shows the results in place when the score lands.
//
// Messages to the parent page (window.postMessage, only to the partner's
// registered sites):  { source: "setmo", type, sessionId, ...data }
//   ready · lead.ready · call.started · call.dropped · call.ended · mic.denied ·
//   results.ready · call.failed · error · close
// The parent can send { type: "setmo:end-call" } to end a live call.

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (rgb: [number, number, number], target: number, amount: number) =>
  "#" + rgb.map((c) => Math.round(c + (target - c) * amount).toString(16).padStart(2, "0")).join("");

/** SetMo's purple, swapped for the partner's accent on the buttons and highlights. */
function accentStyle(accent: string | null): CSSProperties {
  const rgb = accent ? hexToRgb(accent) : null;
  if (!rgb) return {};
  const light = mix(rgb, 255, 0.3);
  const deep = mix(rgb, 0, 0.18);
  return {
    "--purple": accent,
    "--purple-2": light,
    "--purple-deep": deep,
    "--grad": `linear-gradient(135deg, ${accent}, ${deep})`,
    "--grad-num": `linear-gradient(135deg, ${light}, ${deep})`,
    "--glow": `0 14px 40px -18px rgba(${rgb.join(",")}, 0.5)`,
  } as CSSProperties;
}

export function EmbedCall({
  sessionId,
  frameToken,
  serviceLabel,
  accent,
  origins,
}: {
  sessionId: string;
  frameToken: string;
  serviceLabel: string;
  accent: string | null;
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
    <div className="embed-root" style={accentStyle(accent)}>
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
