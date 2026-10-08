"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

// Minutes left to call the lead back, on the viewer's own clock (null while
// rendering on the server).
function useMinutesLeft(until: string): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const t = setInterval(onChange, 15_000);
      return () => clearInterval(t);
    },
    () => Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 60_000)),
    () => null
  );
}

/** The results page's lead reveal while the lead is still in play — a dropped
 *  call that can still be called back, or a callback under way. Who they really
 *  were stays back until then. */
export function RevealHeld({
  sessionId,
  name,
  waiting,
  until,
  isOwner,
}: {
  sessionId: string;
  name: string | null;
  waiting: "choice" | "callback";
  until: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "back" | "show">(null);
  const [err, setErr] = useState<string | null>(null);
  const left = useMinutesLeft(until);
  const first = name?.split(" ")[0] || "them";
  const forAbout = left == null ? "" : left > 0 ? ` for about ${left} more minute${left === 1 ? "" : "s"}` : "";

  async function callBack() {
    setBusy("back");
    setErr(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.sessionId) {
        setErr(data.error ?? "Couldn't call them back. Start a new call from Practice.");
        return;
      }
      router.push(`/session/${data.sessionId}`);
    } catch {
      setErr("Couldn't reach SetMo — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  // Choosing the answers over a callback: the call is closed like any call the
  // setter ended, and the page reloads with the reveal.
  async function showNow() {
    setBusy("show");
    setErr(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/ended`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        setErr("Couldn't do that just now — try again.");
        return;
      }
      router.refresh();
    } catch {
      setErr("Couldn't reach SetMo — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  let body: string;
  if (waiting === "callback") {
    body = isOwner
      ? `You called ${first} back. Their real reason and what was holding them back show here once that call is done.`
      : `This lead was called back. Their real reason and what was holding them back show here once that call is done.`;
  } else if (isOwner) {
    body =
      left === 0
        ? `This call dropped. Reload to see who ${first} really was.`
        : `This call dropped, and you can still call ${first} back${forAbout}. Their real reason and what was holding them back stay hidden until you do — or until you'd rather see them now, which ends the callback.`;
  } else {
    body = `This call dropped and can still be called back${forAbout}, so the lead's real reason and what was holding them back stay hidden for now.`;
  }

  return (
    <div className="card card-pad rise reveal" style={{ marginBottom: 18, animationDelay: ".03s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={{ fontSize: 18 }}>Who you were really talking to</h3>
        <span className="chip amber" style={{ fontSize: 11.5 }}>
          {waiting === "callback" ? "Callback under way" : "Call dropped"}
        </span>
      </div>
      {name && <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 4 }}>{name}</div>}
      <p className="muted" style={{ fontSize: 13.5, maxWidth: "52em" }}>
        {body}
      </p>
      {waiting === "choice" && isOwner && left !== 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button className="btn btn-primary" onClick={callBack} disabled={busy != null}>
            <Icon name="mic" /> {busy === "back" ? "Calling back…" : `Call ${first} back`}
          </button>
          <button className="btn btn-ghost" onClick={showNow} disabled={busy != null}>
            {busy === "show" ? "Opening…" : "See the answers"}
          </button>
        </div>
      )}
      {err && (
        <p className="muted" role="alert" style={{ fontSize: 13, marginTop: 10, color: "var(--rose)" }}>
          {err}
        </p>
      )}
    </div>
  );
}
