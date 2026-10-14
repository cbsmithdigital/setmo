import { checkBotId } from "botid/server";
import { captureError } from "@/lib/observability";

/**
 * True when Vercel BotID says this request came from a bot. Only runs on
 * Vercel (local dev has no challenge), and fails open if the check itself
 * errors — the rate limits still apply — so a hiccup at Vercel can't stop real
 * sign-ups. The route must also be listed in BOT_CHECKED_ROUTES (lib/bot-routes)
 * so the browser attaches the challenge.
 */
export async function isBot(): Promise<boolean> {
  if (!process.env.VERCEL) return false;
  try {
    const verification = await checkBotId();
    // Logged (not reported) so a run of false positives on real people would
    // show in the Vercel logs without flooding Sentry with actual bots.
    if (verification.isBot) console.warn("[setmo:botid] request refused as a bot");
    return verification.isBot;
  } catch (e) {
    captureError(e, { scope: "botid" });
    return false;
  }
}

export const BOT_MESSAGE = "We couldn't verify this request. Refresh the page and try again.";
