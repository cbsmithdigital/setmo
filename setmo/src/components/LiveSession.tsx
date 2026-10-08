"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Icon } from "@/components/ui/Icon";
import { LeadCard } from "@/components/LeadCard";
import { mmss } from "@/lib/format";
import type { LeadCard as LeadCardData } from "@/lib/realism/lead-card";

// pre      → the lead card, before dialing
// live     → on the call
// dropped  → the call cut out (or the page was reopened mid-call)
// wrap     → scoring
type Phase = "pre" | "live" | "dropped" | "wrap" | "error";

type Prep = {
  status: "loading" | "ready" | "unavailable";
  card: LeadCardData | null;
  choiceLabel: string | null;
  difficulty: string | null;
  offer: string | null;
  callback: boolean;
};

const DIFFICULTY_LABEL: Record<string, string> = { ADAPTIVE: "adaptive", WARM: "warm lead", TOUGH: "tough lead" };

// --- animated voice bars ---
function Waveform({ active, bars = 44 }: { active: boolean; bars?: number }) {
  // Deterministic per-bar delay seeds (stable across renders + hydration-safe).
  const seeds = useMemo(
    () => Array.from({ length: bars }, (_, i) => 0.2 + ((i * 37) % 80) / 100),
    [bars]
  );
  return (
    <div className="wf">
      {seeds.map((seed, i) => (
        <i
          key={i}
          style={{
            height: active ? undefined : 14,
            animation: active ? `wf 1.1s ${(seed * 0.9).toFixed(2)}s ease-in-out infinite` : "none",
            opacity: active ? 1 : 0.4,
          }}
        />
      ))}
      <style>{`@keyframes wf{0%,100%{height:16px}50%{height:78px}}`}</style>
    </div>
  );
}

/** Phones and tablets: speaker echo and mic-permission help are worded for them.
 *  Read once — the device doesn't change under a call. */
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
function useDevice(): Device {
  return useSyncExternalStore(noSubscribe, readDevice, () => NO_DEVICE);
}

function SessionInner({
  sessionId,
  serviceLabel,
  remainingMinutes,
}: {
  sessionId: string;
  serviceLabel: string;
  remainingMinutes: number;
}) {
  const router = useRouter();
  const device = useDevice();
  const [phase, setPhase] = useState<Phase>("pre");
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const [wrapNote, setWrapNote] = useState("Grading your skills and writing your feedback.");
  const [personaName, setPersonaName] = useState<string | null>(null);
  const [prep, setPrep] = useState<Prep>({ status: "loading", card: null, choiceLabel: null, difficulty: null, offer: null, callback: false });
  const [showCard, setShowCard] = useState(false);
  const [busy, setBusy] = useState(false);
  // How the call ended matters: a hang-up by the lead goes to feedback, a drop
  // offers a callback. The user's own End is told apart from both.
  const endingRef = useRef(false);
  const connectedRef = useRef(false);
  const phaseRef = useRef<Phase>("pre");
  const conversationIdRef = useRef<string | null>(null);
  // Phase changes go through here so the SDK's callbacks always see the current one.
  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // The results wait on this: until the call is reported ended, a call that
  // dropped looks like it can still be called back, and its results would hold
  // the lead's answers back.
  const endedRef = useRef<Promise<void> | null>(null);
  const reportEnded = useCallback(() => {
    endedRef.current = fetch(`/api/sessions/${sessionId}/ended`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: conversationIdRef.current ?? undefined }),
    }).then(
      () => {},
      () => {} /* the webhook is authoritative regardless */
    );
    return endedRef.current;
  }, [sessionId]);

  const conversation = useConversation({
    micMuted: muted,
    onConnect: ({ conversationId }) => {
      connectedRef.current = true;
      conversationIdRef.current = conversationId;
      // Tell the server the call really connected: a drop from here on is a
      // "call them back", not a retry of the same session.
      void fetch(`/api/sessions/${sessionId}/live`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId }),
      }).catch(() => {});
    },
    onDisconnect: (details) => {
      if (endingRef.current || phaseRef.current !== "live") return;
      const timeUp = details.reason === "error" && details.context?.type === "max_duration_exceeded";
      if (details.reason === "agent" || timeUp) {
        // The lead hung up, or the call hit its time limit — that's the end of
        // the rep: score it.
        endingRef.current = true;
        go("wrap");
        void reportEnded();
      } else if (details.reason === "error" && connectedRef.current) {
        // Cut out mid-call. (A call that never connected is an error, below.)
        go("dropped");
      }
    },
    onError: (msg: string, ctx?: unknown) => {
      if (endingRef.current) return;
      // Mid-call errors from the voice service don't end the call (the socket
      // stays up); a real drop arrives through onDisconnect above.
      if (connectedRef.current && phaseRef.current === "live") return;
      const name = (ctx as { name?: string } | undefined)?.name;
      if (name === "NotAllowedError" || name === "SecurityError" || /permission|not ?allowed|denied/i.test(String(msg))) {
        setMicBlocked(true);
        setErrMsg("SetMo couldn't use your microphone.");
      } else {
        setErrMsg(typeof msg === "string" && msg ? msg : "The call hit an error.");
      }
      go("error");
    },
  });

  const status = conversation.status;
  const speaking = conversation.isSpeaking;

  // The lead card: composed once for this session, then the same person every
  // time the page opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/prepare`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.finished) {
          if (data.status === "SCORED") router.replace(`/results/${sessionId}`);
          else if (data.status === "COMPLETED") go("wrap");
          else {
            setErrMsg("This call didn't go through.");
            go("error");
          }
          return;
        }
        setPrep({
          status: res.ok && data.ready ? "ready" : "unavailable",
          card: data.card ?? null,
          choiceLabel: data.choiceLabel ?? null,
          difficulty: data.difficulty ?? null,
          offer: data.offer ?? null,
          callback: Boolean(data.callback),
        });
        if (data.card?.name) setPersonaName(data.card.name);
        if (data.interrupted) go("dropped");
      } catch {
        if (!cancelled) setPrep((p) => ({ ...p, status: "unavailable" }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, router, go]);

  // elapsed timer while live
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // (The screen stays on during a call: the voice SDK holds a wake lock for the
  // length of the session.)

  // poll for the scored result while wrapping up
  useEffect(() => {
    if (phase !== "wrap") return;
    let tries = 0;
    const poll = setInterval(async () => {
      tries++;
      try {
        await endedRef.current;
        const res = await fetch(`/api/sessions/${sessionId}/result`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "scored") {
            clearInterval(poll);
            router.push(`/results/${sessionId}`);
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      if (tries > 72) {
        clearInterval(poll);
        setWrapNote("Still scoring — your result will appear on your dashboard shortly.");
      }
    }, 2500);
    return () => clearInterval(poll);
  }, [phase, sessionId, router]);

  const startCall = useCallback(async () => {
    setErrMsg(null);
    setMicBlocked(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/connect`, { method: "POST" });
      const cfg = await res.json();
      if (!res.ok) {
        setErrMsg(cfg.error ?? "Couldn't connect the call.");
        go("error");
        return;
      }
      if (!cfg.configured) {
        // A setter should never read a developer message. This happens when a
        // call type has no voice agent wired up yet.
        setErrMsg("This call type isn't ready yet — we've been told. Your minutes weren't used.");
        go("error");
        return;
      }
      setPersonaName(cfg.personaName ?? null);
      endingRef.current = false;
      connectedRef.current = false;
      conversationIdRef.current = null;
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
      setSecs(0);
      setShowCard(false);
      go("live");
    } catch {
      setErrMsg("Couldn't connect the call. Check your connection and try again.");
      go("error");
    } finally {
      setBusy(false);
    }
  }, [conversation, sessionId, go]);

  const endCall = useCallback(async () => {
    endingRef.current = true;
    if (!conversationIdRef.current) {
      try {
        conversationIdRef.current = conversation.getId() || null;
      } catch {
        /* not connected */
      }
    }
    try {
      conversation.endSession();
    } catch {
      /* ignore */
    }
    go("wrap");
    await reportEnded();
  }, [conversation, reportEnded, go]);

  // Whatever is left of a dropped call is closed before moving on.
  const closeLeftover = useCallback(() => {
    endingRef.current = true;
    try {
      conversation.endSession();
    } catch {
      /* already gone */
    }
  }, [conversation]);

  // After a drop: the same lead, on a fresh call.
  const callBack = useCallback(async () => {
    closeLeftover();
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.sessionId) {
        setErrMsg(data.error ?? "Couldn't call them back. Start a new call from Practice.");
        go("error");
        return;
      }
      router.push(`/session/${data.sessionId}`);
    } catch {
      setErrMsg("Couldn't reach SetMo to call them back — check your connection, then start a new call from Practice.");
      go("error");
    } finally {
      setBusy(false);
    }
  }, [sessionId, router, go, closeLeftover]);

  // After a drop: score what happened before it cut out.
  const feedbackOnDrop = useCallback(async () => {
    closeLeftover();
    go("wrap");
    setWrapNote("Scoring what you had before the call dropped.");
    await reportEnded();
  }, [reportEnded, go, closeLeftover]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    conversation.setMuted(next);
  }

  // ---------- ERROR ----------
  if (phase === "error") {
    return (
      <Centered>
        <div className="rise" style={{ textAlign: "center", maxWidth: 460 }}>
          <h2 style={{ fontSize: 24, marginBottom: 12 }}>{micBlocked ? "Your microphone is blocked" : "Couldn't run the call"}</h2>
          <p className="muted" style={{ marginBottom: micBlocked ? 16 : 24 }}>{errMsg}</p>
          {micBlocked && (
            <div className="card card-pad" style={{ textAlign: "left", marginBottom: 22, fontSize: 14, color: "var(--text-2)" }}>
              <b style={{ display: "block", marginBottom: 8, color: "var(--text)" }}>Turn the microphone back on</b>
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
                  <li>Come back here and tap <b>Try again</b>.</li>
                </ol>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-lg" onClick={() => router.push("/practice")}>
              Back to practice
            </button>
            {micBlocked && (
              <button className="btn btn-primary btn-lg" onClick={startCall} disabled={busy}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Centered>
    );
  }

  // ---------- WRAP ----------
  if (phase === "wrap") {
    return (
      <Centered>
        <div style={{ textAlign: "center" }} className="rise">
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 22px",
              borderRadius: "50%",
              border: "3px solid var(--s3)",
              borderTopColor: "var(--purple)",
              animation: "spin .9s linear infinite",
            }}
          />
          <h2 style={{ fontSize: 26, marginBottom: 8 }}>Scoring your call…</h2>
          <p className="muted">{wrapNote}</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </Centered>
    );
  }

  // ---------- DROPPED ----------
  if (phase === "dropped") {
    return (
      <Centered>
        <div className="rise" style={{ textAlign: "center", maxWidth: 480, width: "100%" }}>
          <div className="chip amber" style={{ marginBottom: 16 }}>
            <Icon name="sound" size={13} /> The call cut out
          </div>
          <h2 style={{ fontSize: 26, marginBottom: 10 }}>{personaName ? `Lost ${personaName.split(" ")[0]}` : "The call dropped"}</h2>
          <p className="muted" style={{ marginBottom: 22 }}>
            Call them back — same person, and they&apos;ll know the line cut out — or get feedback on what you had before it dropped.
          </p>
          <div className="call-choice">
            <button className="btn btn-primary btn-lg" onClick={callBack} disabled={busy}>
              <Icon name="mic" /> {busy ? "Calling back…" : "Call them back"}
            </button>
            <button className="btn btn-ghost btn-lg" onClick={feedbackOnDrop} disabled={busy}>
              Feedback on this call
            </button>
          </div>
        </div>
      </Centered>
    );
  }

  // ---------- PRE-CALL ----------
  if (phase === "pre") {
    const diffLabel = DIFFICULTY_LABEL[prep.difficulty ?? ""] ?? "adaptive";
    return (
      <Centered top>
        <div className="rise precall">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
            <span className="chip purple">
              {serviceLabel} · {diffLabel}
            </span>
            {prep.choiceLabel && <span className="chip">You picked: {prep.choiceLabel}</span>}
            {prep.callback && <span className="chip amber">Calling back</span>}
          </div>

          {prep.status === "loading" ? (
            <>
              <h1 className="precall-h">Pulling up your lead…</h1>
              <div className="lead-card lead-card-skeleton" aria-busy="true">
                <div className="sk sk-head" />
                <div className="sk" />
                <div className="sk" />
                <div className="sk sk-short" />
              </div>
            </>
          ) : prep.card ? (
            <>
              <h1 className="precall-h">{prep.callback ? `Call ${prep.card.name.split(" ")[0]} back` : "Your next lead"}</h1>
              <LeadCard card={prep.card} offer={prep.offer} />
              <p className="muted precall-hint">
                Not on the card: why they really reached out, and what&apos;s holding them back. That&apos;s what the call is for.
              </p>
            </>
          ) : (
            <>
              <h1 className="precall-h">You&apos;re calling a new lead.</h1>
              <p className="muted precall-hint">
                Stay warm, listen for the real reason they reached out, and lead them to a booked appointment.
              </p>
            </>
          )}

          <p className="precall-mic">
            <Icon name="mic" size={15} />
            {device.touch ? "Headphones work best — on speaker, the lead can hear itself." : "SetMo needs your microphone for this call."}
          </p>
          <div className="call-choice">
            <button className="btn btn-ghost btn-lg" onClick={() => router.push("/practice")}>
              Back
            </button>
            <button className="btn btn-primary btn-lg" onClick={startCall} disabled={busy || prep.status === "loading"}>
              <Icon name="mic" /> {busy ? "Connecting…" : "Allow mic & start call"}
            </button>
          </div>
        </div>
      </Centered>
    );
  }

  // ---------- LIVE ----------
  const active = status === "connected" && !muted;
  return (
    <div className="call-screen">
      <div className="call-top">
        <div className="chip mint" style={{ padding: "7px 14px", fontSize: 13 }}>
          <span className="live-dot" /> {status === "connected" ? "LIVE PRACTICE" : "CONNECTING…"}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {prep.card && (
            <button className={"chip" + (showCard ? " purple" : "")} onClick={() => setShowCard((s) => !s)} aria-expanded={showCard}>
              <Icon name="doc" size={14} /> Lead card
            </button>
          )}
          <div className="chip">
            <Icon name="clock" size={14} /> {Math.max(0, Math.round(remainingMinutes) * 10).toLocaleString()} tokens left
          </div>
        </div>
      </div>

      {showCard && prep.card && (
        <div className="call-card-peek">
          <LeadCard card={prep.card} offer={prep.offer} />
        </div>
      )}

      <div className="call-mid">
        <div className="call-glow" />
        <div className="muted" style={{ fontSize: 14, position: "relative" }}>
          {status === "connected" ? "On the call with" : "Calling"} {personaName ?? "a new lead"}
        </div>
        <div className="call-timer">{mmss(secs)}</div>
        <div style={{ maxWidth: 560, width: "100%", position: "relative", margin: "10px 0" }}>
          <Waveform active={active || speaking} />
        </div>
        <div className="call-status">
          <span style={{ width: 8, height: 8, borderRadius: 9, background: "var(--purple-2)", flex: "none" }} />
          <span>
            {muted
              ? "You're muted — unmute to keep talking"
              : speaking
                ? "The lead is speaking…"
                : "Listening — take the lead."}
          </span>
        </div>
      </div>

      <div className="call-controls">
        <button
          className="btn btn-ghost btn-lg"
          onClick={toggleMute}
          style={{
            minWidth: 130,
            background: muted ? "rgba(239,68,68,.14)" : "var(--s3)",
            borderColor: muted ? "rgba(239,68,68,.4)" : "var(--line)",
            color: muted ? "#fca5a5" : "var(--text)",
          }}
        >
          <Icon name="mic" size={18} /> {muted ? "Muted" : "Mute"}
        </button>
        <button className="btn btn-primary btn-lg call-end" onClick={endCall}>
          <span className="end-long">End call &amp; get feedback</span>
          <span className="end-short">End call</span> <Icon name="arrow" />
        </button>
      </div>
    </div>
  );
}

function Centered({ children, top = false }: { children: React.ReactNode; top?: boolean }) {
  return <div className={"call-centered" + (top ? " call-centered-top" : "")}>{children}</div>;
}

export function LiveSession(props: {
  sessionId: string;
  serviceLabel: string;
  remainingMinutes: number;
}) {
  return (
    <>
      <div className="app-bg" />
      <ConversationProvider>
        <SessionInner {...props} />
      </ConversationProvider>
    </>
  );
}
