// Vendor-agnostic incentive delivery. Goal-payout logic calls this boundary; the
// actual gift-card vendor (Tremendous / Tango / Rybbon / …) is dropped in later as
// another provider with NO changes to goal logic. Until then the manual provider
// records intent and marks it sent (the admin hands over / emails the reward).

export type IncentiveRequest = {
  toEmail: string;
  toName?: string | null;
  amountCents?: number | null; // for gift cards
  label?: string | null; // custom incentive description
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

// ---- registry ----
// Future: register real adapters here keyed by INCENTIVE_PROVIDER. Each implements
// IncentiveProvider.send() against the vendor API (api key via env), maps our
// amountCents/label to their catalog, and returns the vendor's payout id as
// providerRef. Redemption webhooks (if any) update GoalParticipant.rewardStatus.
const PROVIDERS: Record<string, IncentiveProvider> = {
  manual: new ManualProvider(),
};

export function getIncentiveProvider(): IncentiveProvider {
  const key = (process.env.INCENTIVE_PROVIDER || "manual").toLowerCase();
  return PROVIDERS[key] ?? PROVIDERS.manual;
}
