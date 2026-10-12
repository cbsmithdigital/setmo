"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { isStandalone, pushState, turnOn } from "@/lib/push-client";

// Once SetMo is on someone's home screen, offer phone notifications once — the
// moment it's most useful. Only inside the installed app, only while they
// haven't been asked, and "not now" holds for a month. (The menu's
// Notifications switch is always there either way.)

const DISMISS_KEY = "setmo_notify_dismissed_at";
const DISMISS_MS = 30 * 86400_000;

export function NotifyPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    let dismissedAt = 0;
    try {
      dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    } catch {
      /* storage blocked — still offer it */
    }
    if (!isStandalone() || Date.now() - dismissedAt < DISMISS_MS || typeof Notification === "undefined" || Notification.permission !== "default") return;
    pushState()
      .then((s) => alive && setShow(s === "off"))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!show || pathname.startsWith("/coach")) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* fine — it comes back next visit */
    }
    setShow(false);
  };
  const enable = async () => {
    setBusy(true);
    await turnOn().catch(() => null);
    setBusy(false);
    setShow(false);
  };

  return (
    <div className="install-banner" role="region" aria-label="Turn on notifications">
      <span className="sbn-ic on" style={{ width: 40, height: 40, borderRadius: 12 }}>
        <Icon name="bell" size={20} />
      </span>
      <div className="ib-text">
        <b>Get your scores on your phone</b>
        <span>A notification when a call is scored, a goal is hit, or it&apos;s time for a rep.</span>
      </div>
      <button className="btn btn-primary ib-install" onClick={enable} disabled={busy}>
        {busy ? "…" : "Turn on"}
      </button>
      <button className="ib-close" onClick={dismiss} aria-label="Not now">
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
