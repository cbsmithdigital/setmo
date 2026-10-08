"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { INSTALLABLE_EVENT } from "@/components/PwaRegister";

// "Put SetMo on your home screen" — phones only, never once it's installed, and
// a "not now" holds for a month. Android/Chrome gets a real Install button (the
// browser's own offer); iPhone has no such button, so it gets the Share → Add to
// Home Screen steps instead.

const DISMISS_KEY = "setmo_install_dismissed_at";
const DISMISS_MS = 30 * 86400_000;

type Env = { show: boolean; ios: boolean };
let envCache: Env | null = null;
function readEnv(): Env {
  if (!envCache) {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissedAt = 0;
    try {
      dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    } catch {
      /* storage blocked — just show it */
    }
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // A phone-width screen that's a touch device — not a narrowed desktop window.
    const phone =
      window.matchMedia("(max-width: 880px)").matches &&
      (ios || /Android/i.test(ua) || window.matchMedia("(pointer: coarse)").matches);
    envCache = { show: phone && !standalone && Date.now() - dismissedAt > DISMISS_MS, ios };
  }
  return envCache;
}
const noSubscribe = () => () => {};
const subscribeOffer = (cb: () => void) => {
  window.addEventListener(INSTALLABLE_EVENT, cb);
  return () => window.removeEventListener(INSTALLABLE_EVENT, cb);
};

export function InstallBanner() {
  const env = useSyncExternalStore(noSubscribe, readEnv, () => null);
  const offer = useSyncExternalStore(subscribeOffer, () => window.__setmoInstall ?? null, () => null);
  const [closed, setClosed] = useState(false);
  const pathname = usePathname();

  // Not over the coach chat — on a phone every line of that screen is needed.
  if (!env?.show || closed || pathname.startsWith("/coach")) return null;
  // Android: only once the browser says SetMo can be installed.
  if (!env.ios && !offer) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* fine — it just comes back next visit */
    }
    // Also for the rest of this visit: the banner remounts on every page that
    // has it, and would otherwise read the stale "show".
    if (envCache) envCache = { ...envCache, show: false };
    setClosed(true);
  };
  const install = async () => {
    if (!offer) return;
    await offer.prompt();
    const choice = await offer.userChoice.catch(() => null);
    window.__setmoInstall = null;
    if (choice?.outcome === "accepted") setClosed(true);
    else dismiss();
  };

  return (
    <div className="install-banner" role="region" aria-label="Install SetMo">
      {/* eslint-disable-next-line @next/next/no-img-element -- a 40px app icon */}
      <img src="/icons/icon-192.png" alt="" width={40} height={40} />
      <div className="ib-text">
        <b>Put SetMo on your home screen</b>
        {env.ios ? (
          <span>
            Tap <Icon name="share" size={14} style={{ display: "inline-block", verticalAlign: "-2px" }} /> Share, then <b>Add to Home Screen</b>.
          </span>
        ) : (
          <span>It opens full-screen — practice in one tap.</span>
        )}
      </div>
      {!env.ios && (
        <button className="btn btn-primary ib-install" onClick={install}>
          Install
        </button>
      )}
      <button className="ib-close" aria-label="Not now" onClick={dismiss}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
