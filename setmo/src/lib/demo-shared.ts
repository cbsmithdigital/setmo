// Shared constants for demo / test accounts (Office.isDemo). Kept dependency-free
// so billing, alerts and the platform console can import them without cycles.

/** Internal bookkeeping bundle the demo builder writes so seeded call history
 *  doesn't drain a demo account's real minute balance. Never shown as a purchase. */
export const DEMO_OFFSET_PREFIX = "demo-seed-offset:";

/** Prefix for comp grants written by the demo builder itself. */
export const DEMO_COMP_PREFIX = "demo-comp:";

/** A demo account alerts the super-admin once its balance drops below this. */
export const DEMO_LOW_BALANCE_MIN = 100;

/** What a demo user sees instead of a Stripe checkout. */
export const DEMO_BILLING_MESSAGE =
  "This is a demo account — minutes are topped up by the SetMo team, so there's nothing to buy here.";

/** What a demo user sees instead of sending an invite. Inviting a prospect into a
 *  demo account would tie their email to it and block them from signing up for
 *  real through the partner's link. */
export const DEMO_INVITE_MESSAGE =
  "Demo accounts can't invite people. To let a practice try SetMo, send them your tracking link — their account will be credited to you.";

/** The demo builder's made-up team members all have emails on this domain. */
export const DEMO_PERSONA_DOMAIN = "demo.setmo.invalid";
export const isDemoPersonaEmail = (email: string | null | undefined) => Boolean(email?.toLowerCase().endsWith(`@${DEMO_PERSONA_DOMAIN}`));

/** What a demo admin sees when trying to manage a real login in the demo. */
export const DEMO_MEMBER_MESSAGE =
  "In a demo account you can only manage the demo team, not the partner logins that share it.";

/** True when the user is working inside a demo / test account. */
export function inDemoAccount(user: { office?: { isDemo: boolean } | null; organization?: { isDemo: boolean } | null }): boolean {
  return Boolean(user.office?.isDemo || user.organization?.isDemo);
}
