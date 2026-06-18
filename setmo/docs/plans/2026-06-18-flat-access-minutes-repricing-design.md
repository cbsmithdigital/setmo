# Flat access + pay-as-you-go minutes — repricing design

_Approved spec: SetMo_product_charge_catalog (2026-06-18). Replaces the 3-tier seat model._

## Model
- **Access:** $44.95 / month **per location**, month-to-month. Unlimited free users. All features included for everyone.
- **Minutes:** pay-as-you-go, **roll over** (no reset), **separate per location** (no pooling). Every non-assessment AI call draws from the balance.
- **Assessment:** free for everyone and **never draws balance** (SetMo covers its ~60 min, even at 0). Prospects: one per 2 months + a bimonthly invite.
- **Group/DSO:** same flat model per location; **group admin + Setty Advisor unlock free at 2+ locations**.
- **Partners:** "contact us for distribution" (lead path, no price).
- **Dropped:** seat tiers, founders, quarterly/annual, win-back credit, $50 assessment, 90-day guarantee.

## Minute pricing (continuous, for the slider)
Per-minute interpolates across anchors, then floors:

| Minutes | $/min | Total |
|---|---|---|
| 240 (min) | 0.72 | ~$173 |
| 250 | 0.72 | $180 |
| 500 | 0.66 | $330 |
| 1000 | 0.60 | $600 |
| 1500 (floor) | 0.56 | $840 |
| 1500–2500 | 0.56 (flat) | … |
| > 2500 | — | "Contact for bulk pricing" |

`minutePrice(m)`: ≤250 → .72; 250–500 → lerp .72→.66; 500–1000 → .66→.60; 1000–1500 → .60→.56; ≥1500 → .56. `total = round(m × $/min)`. Discount shown vs the .72 base.

**Recommendation** (slider marker) from "people on the phones": 1 → 240, 3 → 500, 8 → 1000, then +100/person, cap 2500. Slider: min 240, max 2500, 10-min steps; a "Buying for a big group / 2,500+? Contact us" CTA past the top. Minute amounts only — no bundle names.

## Data model changes
- **Subscription** → flat access: keep the row (one per office) for status + `currentPeriodEnd` + stripe ids; stop using `planTier/seats/cadence/isFounder/pricePerSeat` (left as legacy columns).
- **Remove AllowancePeriod** (no monthly included minutes). Balance is derived, not periodized.
- **ConversationBundle** → the minute ledger: each purchase adds `minutesPurchased`. Balance = `Σ minutesPurchased − usedMinutes`.
- **usedMinutes(office)** = Σ `durationSeconds` of the office's **non-assessment** sessions (PRACTICE + COACH) ÷ 60. Assessment (`isAudit`) never counts.
- **SetterAudit**: add `lastInviteAt` for the bimonthly invite; gate retakes by latest audit per `emailDomain`.

## Code changes (by area)
- **pricing.ts** (rewrite, client-safe): `ACCESS_MONTHLY_USD = 44.95`, `minutePrice(m)`, `minuteQuote(m)`, `recommendMinutes(people)`, `MIN_MINUTES=240`, `MAX_MINUTES=2500`, `entitlements()` → all-on + `groupEnabled(locationCount>=2)`. Drop TIERS/founders/cadence.
- **usage.ts / queries.getAllowance** → `getMinuteBalance(officeId)` {purchasedMin, usedMin, remainingMin}; `canStartSession` uses it; assessment bypasses the gate. Remove `drawDownUsage` (balance is derived) — drop its calls in ingest.
- **stripe.ts**: `createAccessCheckout` (monthly $44.95 recurring) + `createMinuteCheckout(minutes)` (one-time inline price_data). Remove tier + $50-audit checkouts. Webhook: access → set Subscription ACTIVE/period; minute purchase → append ConversationBundle.
- **Assessment**: remove `/api/audit/[id]/pay` + `AuditPayButton` + `AUDIT_PRICE_USD`; intake gates prospects to once/2-months (per domain) with a "next available" message; new cron `/api/cron/assessment-invites` (bimonthly) via Resend; `email.ts` invite template.
- **UI**: `AllowanceMeter` + setter dashboard + office "pool" card → **minutes balance**; office **billing page** → access status + **minute slider** (`MinutePurchase` component) replacing bundles + `SubscribeModal`; remove founders/tier UI; landing pricing section → flat model + slider preview; group views unlock by location count.
- **Entitlements**: Setty Office Coach now everyone; group command center / Advisor when org has ≥2 locations.
- **Demo data**: convert offices to flat access + seed a rolling minute balance; Meridian (5 locations) demonstrates group-unlocked-free.

## Phase plan
1. pricing.ts model + minute-balance lib (+ remove AllowancePeriod, derive balance, drop drawdown).
2. Stripe access + minute checkout + webhook.
3. Minute slider UI + billing page + balance UI everywhere.
4. Assessment: drop $50, 2-month gating, bimonthly invite cron.
5. Entitlements all-on + group-by-location; landing page.
6. Demo data migration + verify + deploy.

## Out of scope
Partner/distribution portal (lead path only); proration niceties on access; Tremendous (separate, pending key).
