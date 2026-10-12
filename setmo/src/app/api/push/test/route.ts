import { getCurrentUser } from "@/lib/auth";
import { pushToUsers } from "@/lib/push";
import { error, json } from "@/lib/api";

// POST /api/push/test — a sample notification to every device the signed-in
// person turned notifications on for, so they can see it works.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  const r = await pushToUsers([user.id], {
    title: "Notifications are on",
    body: "This is how SetMo will reach you — scores, goals and reminders.",
    url: "/go",
    tag: "test",
  });
  if (!r.sent) return error("Couldn't reach this device — try turning notifications off and on again.", 409);
  return json({ ok: true, sent: r.sent });
}
