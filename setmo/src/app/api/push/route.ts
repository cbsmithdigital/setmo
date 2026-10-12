import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { vapidPublicKey } from "@/lib/push";
import { error, json } from "@/lib/api";

// Phone notifications for the signed-in person, one device at a time.
//   GET    — the public key a browser subscribes with
//   POST   — this device wants notifications ({ subscription })
//   DELETE — this device doesn't anymore ({ endpoint })

const SubscribeZ = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2000),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  }),
});
const UnsubscribeZ = z.object({ endpoint: z.string().url().max(2000) });

export async function GET() {
  const publicKey = vapidPublicKey();
  return json({ configured: Boolean(publicKey), publicKey });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  // An admin looking through someone's account must not sign their own phone up
  // for that person's notifications.
  if (user.impersonatedBy) return error("Not while viewing as someone else", 403);
  const parsed = SubscribeZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid subscription", 422);
  const { endpoint, keys } = parsed.data.subscription;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  // One row per device: a phone that changes hands (sign out, sign in as someone
  // else) moves to the new person.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const parsed = UnsubscribeZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: user.id } });
  return json({ ok: true });
}
