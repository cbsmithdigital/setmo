import { partnerRoute, apiJson } from "@/lib/partner-http";
import { getPartnerWallet } from "@/lib/partner-wallet";

export const dynamic = "force-dynamic";

// GET /api/v1/wallet — the token balance this key's calls draw from (live and
// test are separate wallets). 1 token = 6 seconds of practice call.
export async function GET(req: Request) {
  return partnerRoute(req, async (caller) => {
    const w = await getPartnerWallet(caller.partnerId, caller.mode);
    return apiJson({
      object: "wallet",
      mode: caller.mode === "LIVE" ? "live" : "test",
      tokens_added: w.addedTokens,
      tokens_used: w.usedTokens,
      balance_tokens: w.balanceTokens,
      can_start_calls: w.remainingSeconds > 60,
    });
  });
}
