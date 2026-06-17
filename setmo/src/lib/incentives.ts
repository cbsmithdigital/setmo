// Vendor-agnostic incentive delivery. Goal-payout logic calls this boundary; the
// concrete vendor is selected by env. Tremendous is the chosen provider; the
// manual provider remains the fallback (records intent, admin delivers by hand).

export type IncentiveRequest = {
  toEmail: string;
  toName?: string | null;
  amountCents?: number | null; // for gift cards / cash rewards
  label?: string | null; // custom incentive description / gift message
  idempotencyKey: string; // = GoalParticipant id, prevents double-sends
};

export type IncentiveResult = {
  status: "SENT" | "FAILED";
  providerRef?: string;
  error?: string;
};

export interface IncentiveProvider {
  readonly name: string;
  /** True when the provider can actually transmit value (vs. manual hand-off). */
  readonly automated: boolean;
  send(req: IncentiveRequest): Promise<IncentiveResult>;
}

// Default: no external transfer. The reward is recorded as sent so the workflow
// completes; the admin physically delivers it (hands over a card, emails a code).
class ManualProvider implements IncentiveProvider {
  readonly name = "manual";
  readonly automated = false;
  async send(req: IncentiveRequest): Promise<IncentiveResult> {
    return { status: "SENT", providerRef: `manual:${req.idempotencyKey}` };
  }
}

// ---- Tremendous (https://developers.tremendous.com) ----
// Creates an Order with one email-delivered reward. Cash-valued only — custom
// (non-cash) incentives like "Half-day PTO" are fulfilled manually, not here.
export function isTremendousConfigured(): boolean {
  return Boolean(process.env.TREMENDOUS_API_KEY);
}
function tremendousBase(): string {
  return process.env.TREMENDOUS_ENV === "production" ? "https://api.tremendous.com/api/v2" : "https://testflight.tremendous.com/api/v2";
}

class TremendousProvider implements IncentiveProvider {
  readonly name = "tremendous";
  readonly automated = true;
  async send(req: IncentiveRequest): Promise<IncentiveResult> {
    const apiKey = process.env.TREMENDOUS_API_KEY;
    if (!apiKey) return { status: "FAILED", error: "TREMENDOUS_API_KEY not set" };
    if (!req.amountCents || req.amountCents <= 0) {
      return { status: "FAILED", error: "Tremendous needs a cash amount — use “Mark sent” for custom incentives." };
    }
    const campaignId = process.env.TREMENDOUS_CAMPAIGN_ID;
    const productIds = (process.env.TREMENDOUS_PRODUCT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!campaignId && productIds.length === 0) {
      return { status: "FAILED", error: "Set TREMENDOUS_CAMPAIGN_ID or TREMENDOUS_PRODUCT_IDS" };
    }

    const body = {
      external_id: req.idempotencyKey, // Tremendous dedupes repeat external_ids → idempotent
      payment: { funding_source_id: process.env.TREMENDOUS_FUNDING_SOURCE_ID || "balance" },
      reward: {
        ...(campaignId ? { campaign_id: campaignId } : { products: productIds }),
        value: { denomination: Math.round(req.amountCents) / 100, currency_code: "USD" },
        recipient: { name: req.toName || "Setter", email: req.toEmail },
        delivery: { method: "EMAIL" },
        meta: { sender_name: process.env.TREMENDOUS_SENDER_NAME || "SetMo", message: req.label || "A reward for hitting your goal — nice work!" },
      },
    };

    try {
      const res = await fetch(`${tremendousBase()}/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { order?: { id?: string; rewards?: { id?: string }[] }; errors?: { message?: string } } | null;
      if (!res.ok) return { status: "FAILED", error: json?.errors?.message || `Tremendous HTTP ${res.status}` };
      const order = json?.order;
      const ref = order?.rewards?.[0]?.id || order?.id;
      return { status: "SENT", providerRef: ref ? `tremendous:${ref}` : "tremendous" };
    } catch (e) {
      return { status: "FAILED", error: e instanceof Error ? e.message : "Tremendous request failed" };
    }
  }
}

// ---- registry ----
const manual = new ManualProvider();
const tremendous = new TremendousProvider();

export function getIncentiveProvider(): IncentiveProvider {
  const sel = (process.env.INCENTIVE_PROVIDER || (isTremendousConfigured() ? "tremendous" : "manual")).toLowerCase();
  if (sel === "tremendous" && isTremendousConfigured()) return tremendous;
  return manual;
}
