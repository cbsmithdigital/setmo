// Phone notifications, browser side: what this device can do, and turning
// notifications on or off for it. The server side is src/lib/push.ts.

export type PushState =
  | "unsupported" // this browser can't do web push at all
  | "needs-install" // an iPhone/iPad in Safari: only the Home Screen app can get notifications
  | "denied" // the person (or the phone's settings) blocked notifications for SetMo
  | "off"
  | "on";

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** The worker registration, if SetMo's service worker is running (production). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg?.active) return reg;
  // Freshly registered: wait briefly for it to start, never forever.
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  if (!reg) return "unsupported";
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Ask for permission (must run from a tap) and sign this device up. */
export async function turnOn(): Promise<PushState | "error"> {
  if (!supported()) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  if (!reg) return "error";
  const { publicKey } = (await fetch("/api/push").then((r) => r.json()).catch(() => ({}))) as { publicKey?: string | null };
  if (!publicKey) return "error";
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch {
    // Signed up earlier with a different key: start over.
    await sub?.unsubscribe().catch(() => {});
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).catch(() => null);
  }
  if (!sub) return "error";
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  }).catch(() => null);
  return res?.ok ? "on" : "error";
}

export async function turnOff(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function sendTest(): Promise<string | null> {
  const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
  if (res?.ok) return null;
  const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
  return data?.error ?? "Couldn't send a test just now.";
}
