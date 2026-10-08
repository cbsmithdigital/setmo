"use client";

import { useEffect } from "react";

/** The browser's "install this app" offer (Chrome/Android/desktop Edge), kept so
 *  SetMo's own Install button can show it at a better moment. Safari has none. */
export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

declare global {
  interface Window {
    __setmoInstall?: InstallEvent | null;
  }
}

export const INSTALLABLE_EVENT = "setmo:installable";

// Registers the service worker (an offline screen, nothing else) and catches the
// install offer as early as possible — it fires once, often before the page that
// shows the Install button has mounted.
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    const onOffer = (e: Event) => {
      e.preventDefault();
      window.__setmoInstall = e as InstallEvent;
      window.dispatchEvent(new Event(INSTALLABLE_EVENT));
    };
    const onInstalled = () => {
      window.__setmoInstall = null;
      window.dispatchEvent(new Event(INSTALLABLE_EVENT));
    };
    window.addEventListener("beforeinstallprompt", onOffer);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onOffer);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
