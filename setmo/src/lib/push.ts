import webpush from "web-push";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Phone notifications (Web Push). A person turns them on per device from the
// app's menu; each device is a PushSubscription row. Sending never throws — a
// notification is a nicety, and nothing that triggers one (scoring, goals,
// billing alerts) may fail because a phone is unreachable. A device the push
// service reports gone (404/410) is deleted.
//
// Works on Android and desktop browsers, and on an iPhone once SetMo is on the
// Home Screen (iOS 16.4+). Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
// ---------------------------------------------------------------------------

export type PushMessage = {
  title: string;
  body: string;
  /** Where tapping the notification opens. */
  url: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag?: string;
  /** Don't show it when SetMo is already open on screen (the app shows it). */
  skipIfVisible?: boolean;
};

let configured: boolean | null = null;

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function setup(): boolean {
  if (configured != null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  configured = Boolean(pub && priv);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://setmo.growdental.ai", pub!, priv!);
  return configured;
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

/** One device. Returns "gone" when the push service says it no longer exists. */
export async function sendToSubscription(sub: Sub, msg: PushMessage, ttlSeconds = 24 * 60 * 60): Promise<"sent" | "gone" | "failed"> {
  if (!setup()) return "failed";
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(msg),
      { TTL: ttlSeconds, urgency: "normal" }
    );
    return "sent";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    const { captureError } = await import("@/lib/observability");
    captureError(e, { scope: "push", status });
    return "failed";
  }
}

/** Every device these people have turned notifications on for. */
export async function pushToUsers(userIds: string[], msg: PushMessage, opts: { ttlSeconds?: number } = {}): Promise<{ sent: number; removed: number }> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length || !setup()) return { sent: 0, removed: 0 };
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: ids } }, select: { id: true, endpoint: true, p256dh: true, auth: true } });
    let sent = 0;
    const gone: string[] = [];
    const delivered: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        const r = await sendToSubscription(s, msg, opts.ttlSeconds);
        if (r === "sent") {
          sent++;
          delivered.push(s.id);
        } else if (r === "gone") gone.push(s.id);
      })
    );
    if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
    if (delivered.length) await prisma.pushSubscription.updateMany({ where: { id: { in: delivered } }, data: { lastSentAt: new Date() } });
    return { sent, removed: gone.length };
  } catch (e) {
    const { captureError } = await import("@/lib/observability");
    captureError(e, { scope: "push" });
    return { sent: 0, removed: 0 };
  }
}
