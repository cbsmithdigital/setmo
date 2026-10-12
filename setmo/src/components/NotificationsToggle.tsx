"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { pushState, sendTest, turnOff, turnOn, type PushState } from "@/lib/push-client";

// "Notifications" in the menu: turn this device's phone notifications on or off
// (score ready, goal reached, low tokens, practice reminders), and send a test.
// Hidden where the browser can't do them at all.

const LINE: Record<PushState, string> = {
  on: "On for this device",
  off: "Scores, goals and reminders",
  denied: "Blocked in this browser's settings",
  "needs-install": "Add SetMo to your Home Screen first",
  unsupported: "",
};

export function NotificationsToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    pushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, []);

  if (!state || state === "unsupported") return null;

  const on = async () => {
    setBusy(true);
    setNote(null);
    const r = await turnOn().catch(() => "error" as const);
    if (r === "error") setNote("Couldn't turn them on — try again in a moment.");
    else setState(r);
    setBusy(false);
  };
  const off = async () => {
    setBusy(true);
    setNote(null);
    await turnOff();
    setState("off");
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    const err = await sendTest();
    setNote(err ?? "Sent — it should arrive in a few seconds.");
    setBusy(false);
  };

  return (
    <div className="sb-notify">
      <div className="sbn-row">
        <span className={"sbn-ic" + (state === "on" ? " on" : "")}>
          <Icon name="bell" size={16} />
        </span>
        <div className="sbn-text">
          <b>Notifications</b>
          <span>{LINE[state]}</span>
        </div>
        {state === "off" && (
          <button className="btn btn-primary sbn-btn" onClick={on} disabled={busy}>
            {busy ? "…" : "Turn on"}
          </button>
        )}
        {state === "on" && (
          <button className="btn btn-ghost sbn-btn" onClick={off} disabled={busy}>
            Turn off
          </button>
        )}
        {state === "needs-install" && (
          <Link className="btn btn-ghost sbn-btn" href="/install">
            How
          </Link>
        )}
      </div>
      {state === "on" && (
        <button className="sbn-test" onClick={test} disabled={busy}>
          Send a test notification
        </button>
      )}
      {note && <div className="sbn-note">{note}</div>}
    </div>
  );
}
