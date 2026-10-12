"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { INSTALLABLE_EVENT } from "@/components/PwaRegister";

export type Platform = "ios" | "android" | "computer";

const TABS: { key: Platform; label: string }[] = [
  { key: "ios", label: "iPhone" },
  { key: "android", label: "Android" },
  { key: "computer", label: "Computer" },
];

const subscribeOffer = (cb: () => void) => {
  window.addEventListener(INSTALLABLE_EVENT, cb);
  return () => window.removeEventListener(INSTALLABLE_EVENT, cb);
};
const noSubscribe = () => () => {};
const readStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallGuide({ initial, url, qrSvg }: { initial: Platform; url: string; qrSvg: string }) {
  const [tab, setTab] = useState<Platform>(initial);
  const [copied, setCopied] = useState(false);
  // Chrome on Android hands us its own install offer when SetMo can be installed.
  const offer = useSyncExternalStore(subscribeOffer, () => window.__setmoInstall ?? null, () => null);
  const standalone = useSyncExternalStore(noSubscribe, readStandalone, () => false);
  const [installed, setInstalled] = useState(false);

  const install = async () => {
    if (!offer) return;
    await offer.prompt();
    const choice = await offer.userChoice.catch(() => null);
    window.__setmoInstall = null;
    if (choice?.outcome === "accepted") setInstalled(true);
  };
  const copy = async () => {
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const share = async () => {
    if (navigator.share) await navigator.share({ title: "Get the SetMo app", text: "Put SetMo on your phone — practice calls, scores and coaching.", url }).catch(() => {});
    else await copy();
  };

  return (
    <div className="ig">
      <div className="ig-card">
        <div className="ig-head">
          <Image src="/icons/icon-192.png" alt="" width={56} height={56} className="ig-icon" />
          <div>
            <h1>Get the SetMo app</h1>
            <p className="muted">Practice calls, your scores and coaching — one tap from your home screen.</p>
          </div>
        </div>

        {standalone || installed ? (
          <div className="ig-done">
            <Icon name="check" size={18} /> {installed ? "Installed — open SetMo from your home screen." : "You're already using the app."}
          </div>
        ) : (
          <>
            <div className="ig-tabs" role="tablist" aria-label="Your device">
              {TABS.map((t) => (
                <button key={t.key} role="tab" aria-selected={tab === t.key} className={"ig-tab" + (tab === t.key ? " on" : "")} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "ios" && (
              <ol className="ig-steps">
                <li>
                  Open this page in <b>Safari</b>.
                </li>
                <li>
                  Tap the <b>Share</b> button <Icon name="share" size={16} className="ig-inline" /> at the bottom of the screen.
                </li>
                <li>
                  Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.
                </li>
                <li>
                  Open <b>SetMo</b> from your home screen and sign in.
                </li>
              </ol>
            )}

            {tab === "android" && (
              <>
                {offer && (
                  <button className="btn btn-primary btn-lg ig-install" onClick={install}>
                    <Icon name="arrow" size={18} /> Install SetMo
                  </button>
                )}
                <ol className="ig-steps">
                  <li>
                    Open this page in <b>Chrome</b>.
                  </li>
                  <li>
                    Tap <b>Install</b> when it pops up — or open the <b>⋮</b> menu and choose <b>Install app</b> (or <b>Add to Home screen</b>).
                  </li>
                  <li>
                    Open <b>SetMo</b> from your home screen and sign in.
                  </li>
                </ol>
              </>
            )}

            {tab === "computer" && (
              <div className="ig-computer">
                <div className="ig-qr" aria-label="QR code that opens this page on a phone" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <div>
                  <p>
                    <b>Scan this with your phone&apos;s camera</b> to open this page there, then follow the steps for your phone.
                  </p>
                  <p className="muted" style={{ fontSize: 13.5 }}>
                    To install it on this computer too: in Chrome or Edge, click the install icon at the right of the address bar, then <b>Install</b>.
                  </p>
                </div>
              </div>
            )}

            <p className="ig-tip">
              <Icon name="bell" size={15} />
              <span>
                Once it&apos;s installed, turn on <b>Notifications</b>{" "}in the menu to get your scores the moment they&apos;re ready.
              </span>
            </p>
          </>
        )}

        <div className="ig-share">
          <div>
            <b>Sending this to your team?</b>
            <span className="muted">Share the link — it opens these steps on their phone.</span>
          </div>
          <div className="ig-share-btns">
            <button className="btn btn-ghost" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <button className="btn btn-ghost" onClick={share}>
              <Icon name="share" size={16} /> Share
            </button>
          </div>
        </div>

        <div className="ig-foot">
          <Link href="/login">Sign in to SetMo</Link>
        </div>
      </div>
    </div>
  );
}
