"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { mmss } from "@/lib/format";

// mic        → checking the microphone, before any call is started (so a
//              blocked or missing mic never uses up a try)
// connecting → setting up the call
// live       → on the call
// ended      → over: they ended it, the lead hung up, or time ran out
// dropped    → the line cut out mid-call
type Phase = "mic" | "connecting" | "live" | "ended" | "dropped" | "error";
type MicProblem = "blocked" | "unsupported" | "missing" | "busy";

/** Phones and tablets: the headphones tip and the mic-permission steps are
 *  worded for them (as on the practice call screen). Read once — the device
 *  doesn't change under a call. */
type Device = { touch: boolean; ios: boolean; android: boolean };
const NO_DEVICE: Device = { touch: false, ios: false, android: false };
let deviceCache: Device | null = null;
function readDevice(): Device {
  if (!deviceCache) {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    deviceCache = { touch: ios || android || window.matchMedia("(pointer: coarse)").matches, ios, android };
  }
  return deviceCache;
}
const noSubscribe = () => () => {};
export function useDevice(): Device {
  return useSyncExternalStore(noSubscribe, readDevice, () => NO_DEVICE);
}

/** Ask for the microphone before the call is started. The stream is held until
 *  the call is set up (as the voice SDK holds its own first one), so the grant
 *  is still live when the call asks again. */
async function checkMic(): Promise<{ stream: MediaStream; problem: null } | { stream: null; problem: MicProblem }> {
  if (!navigator.mediaDevices?.getUserMedia) return { stream: null, problem: "unsupported" };
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio: true }), problem: null };
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") return { stream: null, problem: "blocked" };
    if (name === "NotFoundError" || name === "OverconstrainedError") return { stream: null, problem: "missing" };
    return { stream: null, problem: "busy" };
  }
}

const MIC_MESSAGE: Record<MicProblem, string> = {
  blocked: "SetMo couldn't use your microphone.",
  unsupported: "This browser can't use a microphone. Open the link from your email in Safari or Chrome, or on a computer with a mic.",
  missing: "We couldn't find a microphone. Plug in a headset, or open the link on a phone or a computer with a mic.",
  busy: "Your microphone is busy or unavailable. Close any other app using it (a softphone or a video call), then try again.",
};

function Wave({ active }: { active: boolean }) {
  const seeds = useMemo(() => Array.from({ length: 32 }, (_, i) => 0.2 + ((i * 31) % 80) / 100), []);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 80 }}>
      {seeds.map((s, i) => (
        <i key={i} style={{ width: 5, borderRadius: 99, background: "linear-gradient(180deg,#a78bfa,#7c3aed)", height: active ? undefined : 12, animation: active ? `acw 1.1s ${(s * 0.9).toFixed(2)}s ease-in-out infinite` : "none", opacity: active ? 1 : 0.4 }} />
      ))}
      <style>{`@keyframes acw{0%,100%{height:14px}50%{height:58px}}`}</style>
    </div>
  );
}

function Inner({ auditId, callNumber, totalCalls, maxSeconds, onDone }: { auditId: string; callNumber: number; totalCalls: number; maxSeconds: number; onDone: () => void }) {
  const device = useDevice();
  const [phase, setPhase] = useState<Phase>("mic");
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [micProblem, setMicProblem] = useState<MicProblem | null>(null);
  const [personaName, setPersonaName] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  // Whether this try got as far as asking the server for a call (and so used one).
  const [usedTry, setUsedTry] = useState(false);
  const [endedBy, setEndedBy] = useState<"you" | "lead" | "time">("you");
  const started = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const connectedRef = useRef(false);
  // How the call ended matters (as on the practice screen): the lead hanging up
  // ends it, a drop says so, and the prospect's own End is told apart from both.
  const endingRef = useRef(false);
  // Closed or cancelled: whatever is still in flight stops there.
  const closedRef = useRef(false);
  // The checked microphone, held until the call is up (or isn't coming).
  const micRef = useRef<MediaStream | null>(null);
  const releaseMic = useCallback(() => {
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
  }, []);
  const phaseRef = useRef<Phase>("mic");
  // Phase changes go through here so the SDK's callbacks always see the current one.
  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);
  // Whether the error screen can offer another try: a call that never connected
  // didn't use up the free call, so the prospect can just go again.
  const [canRetry, setCanRetry] = useState(false);

  const fail = useCallback((message: string) => {
    releaseMic();
    setErr(message);
    setCanRetry(!connectedRef.current);
    go("error");
  }, [go, releaseMic]);

  const conversation = useConversation({
    onConnect: ({ conversationId }: { conversationId: string }) => {
      releaseMic();
      connectedRef.current = true;
      setSecs(0);
      go("live");
      // From here this is the prospect's free call. If another window got there
      // first, this one is hung up.
      void fetch(`/api/audit/${auditId}/live`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, conversationId }),
      }).then(async (r) => {
        if (r.status === 409) {
          const j = await r.json().catch(() => ({}));
          endingRef.current = true;
          try { conversation.endSession(); } catch { /* ignore */ }
          connectedRef.current = false;
          setErr(j.error ?? "Your free call is already running in another window.");
          setCanRetry(false);
          go("error");
        }
      }).catch(() => {});
    },
    onDisconnect: (details) => {
      if (endingRef.current || phaseRef.current !== "live") return;
      const timeUp = details.reason === "error" && details.context?.type === "max_duration_exceeded";
      if (details.reason === "agent" || timeUp) {
        // The lead hung up, or the call hit its time limit: that's the call.
        endingRef.current = true;
        setEndedBy(timeUp ? "time" : "lead");
        go("ended");
      } else if (details.reason === "error" && connectedRef.current) {
        // Cut out mid-call. What was said still reaches us and is scored.
        endingRef.current = true;
        go("dropped");
      }
    },
    onError: (m: string, ctx?: unknown) => {
      if (endingRef.current || closedRef.current) return;
      // Mid-call errors from the voice service don't end the call (the line
      // stays up); a real drop arrives through onDisconnect above.
      if (connectedRef.current && phaseRef.current === "live") return;
      const name = (ctx as { name?: string } | undefined)?.name;
      if (name === "NotAllowedError" || name === "SecurityError" || /permission|not ?allowed|denied/i.test(String(m))) {
        setMicProblem("blocked");
        fail(MIC_MESSAGE.blocked);
      } else {
        fail("Couldn't connect the call. Check your connection, then try again.");
      }
    },
  });
  const speaking = conversation.isSpeaking;

  const end = useCallback((by: "you" | "time" = "you") => {
    endingRef.current = true;
    try { conversation.endSession(); } catch { /* ignore */ }
    setEndedBy(by);
    go("ended");
  }, [conversation, go]);

  // Close before the call is up: nothing more starts. (A try already begun
  // is ended with the overlay; one that never connected doesn't count.)
  const cancel = useCallback(() => {
    closedRef.current = true;
    endingRef.current = true;
    releaseMic();
    try { conversation.endSession(); } catch { /* nothing started */ }
    onDone();
  }, [conversation, onDone, releaseMic]);

  const connect = useCallback(async () => {
    setErr(null);
    setMicProblem(null);
    setUsedTry(false);
    connectedRef.current = false;
    endingRef.current = false;
    go("mic");
    // The microphone first: a blocked or missing one never asks the server
    // for a call, so it can't use up a try.
    const mic = await checkMic();
    if (closedRef.current) {
      mic.stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    if (mic.problem) {
      setMicProblem(mic.problem);
      setErr(MIC_MESSAGE[mic.problem]);
      setCanRetry(mic.problem !== "unsupported");
      go("error");
      return;
    }
    releaseMic();
    micRef.current = mic.stream;
    go("connecting");
    setUsedTry(true);
    try {
      const res = await fetch(`/api/audit/${auditId}/connect`, { method: "POST" });
      const cfg = await res.json();
      if (closedRef.current) return;
      if (typeof cfg.attemptsLeft === "number") setAttemptsLeft(cfg.attemptsLeft);
      if (!res.ok) { releaseMic(); setErr(cfg.error ?? "Couldn't start the call."); setCanRetry(res.status === 502); go("error"); return; }
      if (!cfg.configured) { releaseMic(); setErr("Voice calls aren't configured yet."); setCanRetry(false); go("error"); return; }
      sessionIdRef.current = cfg.sessionId ?? null;
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
    } catch {
      if (!closedRef.current) fail("Couldn't reach the call. Check your connection, then try again.");
    }
  }, [auditId, conversation, fail, go, releaseMic]);

  useEffect(() => {
    closedRef.current = false;
    return () => {
      closedRef.current = true;
      releaseMic();
    };
  }, [releaseMic]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void connect();
  }, [connect]);

  // Tick + hard cap each audit call.
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (phase === "live" && secs >= maxSeconds) {
      const t = setTimeout(() => end("time"), 0);
      return () => clearTimeout(t);
    }
  }, [phase, secs, maxSeconds, end]);

  const remaining = Math.max(0, maxSeconds - secs);
  const lead = personaName?.split(" ")[0] ?? null;
  // A mic problem caught before the server was asked didn't use a try; anything
  // after that needs one left.
  const retryable = canRetry && micProblem !== "unsupported" && (!usedTry || attemptsLeft !== 0);
  // A call too short to score can be made again, unless that was the last try.
  const callAgain = attemptsLeft === 0 ? "" : ", and you can call again";
  const primary = { background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", color: "#fff", border: "none", borderRadius: 999, fontWeight: 600, cursor: "pointer" } as const;
  const ghost = { background: "#1a1a2e", color: "#e2e8f0", border: "1px solid #2a2a45", borderRadius: 999, cursor: "pointer" } as const;
  const note = { color: "#94a3b8", fontSize: 13 } as const;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(6,6,12,.85)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "min(540px,94vw)", maxHeight: "94vh", overflowY: "auto", background: "#0d0d18", border: "1px solid #20203a", borderRadius: 24, padding: 28, color: "#e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#94a3b8" }}>{totalCalls === 1 ? "Your free audit call" : `Audit call ${callNumber} of ${totalCalls}`}</span>
          {phase === "live" && <span style={{ fontSize: 12.5, color: "#34d399", fontWeight: 600 }}>● Live · {mmss(remaining)} left</span>}
        </div>

        {phase === "error" ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            {micProblem === "blocked" && <h2 style={{ fontSize: 20, marginBottom: 12 }}>Your microphone is blocked</h2>}
            <p style={{ background: "#3a1212", border: "1px solid #6b2525", color: "#fca5a5", borderRadius: 12, padding: "12px 14px", marginBottom: canRetry ? 8 : 18, fontSize: 14 }}>{err}</p>
            {micProblem === "blocked" && (
              <div style={{ textAlign: "left", background: "#14142a", border: "1px solid #2a2a45", borderRadius: 12, padding: "12px 16px", margin: "12px 0", fontSize: 13.5, color: "#cbd5e1" }}>
                <b style={{ display: "block", marginBottom: 8, color: "#e2e8f0" }}>Turn the microphone back on</b>
                {device.ios ? (
                  <ol style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
                    <li>Open the iPhone <b>Settings</b> app.</li>
                    <li>Go to <b>Apps → Safari → Microphone</b> (on older iPhones: <b>Safari → Microphone</b>) and choose <b>Ask</b> or <b>Allow</b>.</li>
                    <li>Come back here and tap <b>Try again</b> — allow the microphone when asked.</li>
                  </ol>
                ) : device.android ? (
                  <ol style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
                    <li>Tap the icon left of the web address (or the ⋮ menu → <b>Settings → Site settings</b>).</li>
                    <li>Set <b>Microphone</b> to <b>Allow</b> for this site.</li>
                    <li>Come back here and tap <b>Try again</b>.</li>
                  </ol>
                ) : (
                  <ol style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
                    <li>Click the lock or settings icon left of the web address.</li>
                    <li>Set <b>Microphone</b> to <b>Allow</b> for this site.</li>
                    <li>Come back here and click <b>Try again</b>.</li>
                  </ol>
                )}
              </div>
            )}
            {!usedTry ? (
              <p style={{ ...note, marginBottom: 18 }}>No call was started, so this didn&apos;t use up a try.</p>
            ) : (
              canRetry && (
                <p style={{ ...note, marginBottom: 18 }}>
                  The call never connected, so it didn&apos;t use up your free call.
                  {attemptsLeft != null && attemptsLeft > 0 && ` ${attemptsLeft} ${attemptsLeft === 1 ? "try" : "tries"} left to get connected.`}
                </p>
              )
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {retryable && (
                <button onClick={() => void connect()} style={{ ...primary, padding: "11px 22px" }}>Try again</button>
              )}
              <button className="btn btn-ghost" onClick={onDone} style={{ ...ghost, padding: "11px 20px" }}>Close</button>
            </div>
          </div>
        ) : phase === "ended" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg,#34d399,#10b981)", display: "grid", placeItems: "center", margin: "0 auto 14px", color: "#06281d", fontWeight: 900, fontSize: 26 }}>✓</div>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>{totalCalls === 1 ? "Call done" : `Call ${callNumber} done`}</h2>
            <p style={{ color: "#94a3b8", marginBottom: secs < 60 ? 10 : 20, fontSize: 14.5 }}>
              {endedBy === "lead" ? `${lead ?? "The lead"} ended the call. ` : endedBy === "time" ? "That's the time limit for the call. " : ""}
              Scoring it now — this takes about a minute.
            </p>
            {secs < 60 && (
              <p style={{ ...note, marginBottom: 20 }}>Calls under a minute are too short to score. If this one was, it won&apos;t use up your free call{callAgain}.</p>
            )}
            <button onClick={onDone} style={{ ...primary, padding: "12px 24px" }}>Continue</button>
          </div>
        ) : phase === "dropped" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>The call cut out</h2>
            <p style={{ color: "#94a3b8", marginBottom: 10, fontSize: 14.5 }}>
              We&apos;ll score what you had before it dropped — this takes about a minute.
            </p>
            <p style={{ ...note, marginBottom: 20 }}>If it ran under a minute, it won&apos;t use up your free call{callAgain}.</p>
            <button onClick={onDone} style={{ ...primary, padding: "12px 24px" }}>Continue</button>
          </div>
        ) : (
          <>
            <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 2 }}>
              {phase === "mic" ? "Getting your microphone ready" : `${phase === "connecting" ? "Calling" : "On the call with"} ${personaName ?? "a new lead"}`}
            </div>
            <div style={{ textAlign: "center", margin: "10px 0" }}>
              <div style={{ color: "#94a3b8", fontSize: 13 }}>
                {phase === "mic" ? "Allow the microphone when your browser asks." : phase === "connecting" ? "Connecting…" : speaking ? "Lead is speaking…" : "Listening — take the call"}
              </div>
              <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 42, fontVariantNumeric: "tabular-nums", margin: "6px 0" }}>{mmss(secs)}</div>
            </div>
            <Wave active={phase === "live"} />
            <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
              {phase === "live" ? (
                <button onClick={() => end()} style={{ ...primary, padding: "13px 28px" }}>
                  End call &amp; score it
                </button>
              ) : (
                <button className="btn btn-ghost" onClick={cancel} style={{ ...ghost, padding: "12px 24px" }}>
                  Cancel
                </button>
              )}
            </div>
            {phase === "live" && secs < 60 && (
              <p style={{ ...note, textAlign: "center", marginTop: 12 }}>Calls under a minute are too short to score.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function AuditCall(props: { auditId: string; callNumber: number; totalCalls: number; maxSeconds: number; onDone: () => void }) {
  return (
    <ConversationProvider>
      <Inner {...props} />
    </ConversationProvider>
  );
}
