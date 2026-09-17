import { getPricingConfig } from "@/lib/config";

// Checkout minute bounds come from the LIVE pricing config, not the compiled
// defaults — raising maxMinutes in the super-admin pricing editor used to have no
// effect on any checkout, so a bigger purchase was rejected at 1,200 minutes.
export type MinuteBounds = { min: number; max: number };

export async function minuteBounds(): Promise<MinuteBounds> {
  const cfg = await getPricingConfig();
  return { min: cfg.minMinutes, max: cfg.maxMinutes };
}

export type MinuteCheck =
  | { ok: true }
  | { ok: false; status: number; message: string; code?: "BULK" };

/** Validate a requested minute amount against the live config.
 *  `allowZero` is for activation, where 0 means access-only. */
export async function checkMinutes(minutes: number, opts: { allowZero?: boolean } = {}): Promise<MinuteCheck> {
  const { min, max } = await minuteBounds();
  if (opts.allowZero && minutes === 0) return { ok: true };
  if (minutes > max) {
    return {
      ok: false,
      status: 422,
      code: "BULK",
      message: "That's above the self-serve limit — talk to us about a committed plan.",
    };
  }
  if (minutes < min) return { ok: false, status: 422, message: `The minimum purchase is ${min} minutes.` };
  return { ok: true };
}
