# SetMo — Product & Strategy Updates (read alongside the PRD)

The PRD in `docs/` is the original behavioral spec. Since it was written, the marketing/positioning and packaging evolved. **Where this file conflicts with the PRD, this file wins** for pricing, packaging, the Setty coach, the Setter Audit, and the included-hours number. Everything else in the PRD still holds.

These changes are reflected in `prototype/SetMo Marketing.html`.

---

## 1. Packaging — three tiers (was: single per-seat price)

SetMo is now sold as a **Good / Better / Best** ladder. Plans run **quarterly or annual** (annual ≈ 10% off — confirm exact %).

| Tier | Price (list) | Founders price | What it adds |
|---|---|---|---|
| **Team** | **$199 / seat / mo** | $129 / seat | Setter practice, scoring, progress, leaderboards. 5 hrs/seat pooled. |
| **Practice** | **$499 / location / mo** | $349 | Everything in Team + office-manager dashboard + **Setty Office Coach**. Includes **1 manager seat + 2 setter seats**; extra setters **$149/mo** each (Founders $99). |
| **Group / DSO** | **Custom** | Locked discount + roadmap input | Everything in Practice + multi-location command center + **Setty Advisor** + playbook rollout. |

**Backend impact** (`DATA_MODEL.md` → `subscription`):
- Add `plan_tier` enum: `team | practice | group`.
- `subscription` is **per-seat** for Team, **per-location** for Practice (bundled seats: 1 manager + 2 setters, then metered extra setters), **custom** for Group.
- Entitlements/features gate on `plan_tier` (e.g. Setty Office Coach requires `practice`+; command center + Setty Advisor require `group`).

### Founders Cohort
A capped early-adopter program; **founding pricing locks for the life of the plan**; offer closes **Aug 1, 2026**. Model as a boolean/price-book flag on `subscription` (`is_founder`, `founder_locked_price`). Surface a countdown/closing date in the UI.

### Commitment & win-back (replaces the old flat 30-day money-back)
- Quarterly/annual commitment.
- **First-month win-back credit** if the office hits **85% of included usage in month one** AND **completes the best-practices trainings within 3 weeks** (conditions TBD — see PRD fill-in list).
- Plus a softer **90-day "we'll make it right" guarantee**.
- Backend: track month-one usage % and required-training completion to evaluate the credit; issue a Stripe credit/coupon when earned.

---

## 2. Included practice hours: **5 hrs/seat/month** (was 3)

Update the allowance math everywhere: `allowance_period.included_seconds = seats × 5 × 3600`. Pooled across the team; **no auto-overage** (unchanged); top-ups via prepaid bundles (unchanged). The prototype's mock data may still show "3 hrs" in places — **5 is correct**.

---

## 3. Setty — the productized AI coach (was: generic "Coach")

The Coach surface is now branded **Setty** and split by tier:

- **Setty Office Coach** (Practice tier) — for the office manager. Reads every setter's scores, flags who's slipping and why, **drafts the next training**, and is conversational ("talk through the call nobody's sure how to handle"). This is the office-admin-facing counterpart to the setter's coach chat.
- **Setty Advisor** (Group tier) — for owners/ops leaders. Trained on the **group's** data; reads every location's numbers and **recommends the next move** (who to coach, what to roll out, where to look).

**Backend impact** (extends `API_SURFACE.md` → Coach):
- `POST /api/coach/chat` already exists for the setter. Add manager/group context variants (or a `scope` param: `setter | office | group`) so Setty answers from the right data slice with the right RBAC.
- Setty's recommendations should draw from the same `recommendation` + `skill_score` + leaderboard data, summarized per office (Office Coach) or per group (Advisor).
- Same "proxy the LLM server-side" rule as the setter coach — keys/prompts never client-side.

---

## 4. The Setter Audit — the front-door offer (NEW feature & flow)

A no-login-required (or light-login) **assessment** that doubles as the sales motion:
- A setter runs **5 simulated-but-setable leads** in the browser.
- All 5 are scored on the **same 8-point rubric**.
- Output: a **one-page report** — overall score, the **top leaking skills**, and the gap **translated into expected growth** ("+X booked consults/mo · ~$Y").
- **First audit free, one per office**; additional audits **$50 each** (Stripe one-time).

**Backend impact** (new):
- New entity `setter_audit`: `id`, `office_id` (nullable for cold prospects), `prospect_email`, `status` (`in_progress | scored`), `sessions[]` (5 audit sessions, reuse `session`/`evaluation` with an `is_audit` flag), `overall_score`, `top_leak_skills jsonb`, `estimated_recovery jsonb` ({consults_per_month, dollar_value}), `is_free`, `stripe_payment_intent` (for paid audits), `created_at`.
- Endpoints: `POST /api/audit` (start — enforce one-free-per-office), `GET /api/audit/:id` (report), `POST /api/audit/:id/pay` (Stripe for additional audits).
- Reuse the session→ElevenLabs→post-call-webhook scoring loop; just tag sessions `is_audit=true` so they don't count against a paid allowance pool the same way (define audit metering).
- The **estimated recovery** calc is a simple model: (setable leads missed × close value) — keep the formula in one server-side service so it's tunable.

---

## 5. Audience / messaging (no schema impact, but shapes the UI)

The product is now explicitly sold to **three audiences at once** — setters, office managers, and groups/DSOs — as one platform that "climbs" (setter → practice → group). Keep that hierarchy legible in navigation and entitlements (it maps cleanly onto the four role workspaces already in `prototype/SetMo App.html`).

---

## Quick checklist for Claude Code
- [ ] `subscription.plan_tier` (team/practice/group) + per-seat vs per-location billing + bundled seats for Practice.
- [ ] Founders flag + locked price + Aug 1 2026 close; month-one win-back credit logic.
- [ ] Allowance = seats × **5** hrs; no overage; bundles unchanged.
- [ ] Setty scopes (setter/office/group) over the coach endpoint, gated by tier + RBAC.
- [ ] `setter_audit` entity + endpoints + free-per-office rule + paid ($50) audits; recovery-estimate service.
- [ ] Feature gating by tier (Office Coach = Practice+, command center + Advisor = Group).
