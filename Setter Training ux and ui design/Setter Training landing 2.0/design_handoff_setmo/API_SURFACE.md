# SetMo — API Surface (backend reference)

Endpoints needed to back the prototype, grouped by area and tagged with the screen(s) they serve. Default stack: **Next.js (App Router) route handlers on Vercel**, **Neon Postgres**, **Supabase auth**, **Trigger.dev** jobs, **Resend** email, **Stripe** billing, **ElevenLabs** voice. Auth on every route; enforce the role scope from `DATA_MODEL.md`.

Convention below: `METHOD /path` — purpose *(screen)*.

---

## Auth & onboarding
- `POST /api/auth/accept-invite` — set name + password for an invited user, activate account *(Accept-invite / set-up-account)*. Invites are created by office admins and emailed via Resend.
- `GET  /api/me` — current user, role, office/org, feature scope *(all)*.
- Login/session handled by Supabase auth (`POST /api/auth/login`, logout).

## Setter — sessions (the core loop)
- `GET  /api/services` — service types available to the setter's office (`office_service.enabled` ∩ `agent.status='live'`) *(Service picker)*.
- `POST /api/sessions` — **server bootstraps** an ElevenLabs session: creates a `session` row, resolves persona/difficulty seed and the setter's `setter_memory`, returns a short-lived ElevenLabs client token/signed config with **session overrides** (office name, city, offer/voucher policy, enabled services, memory summary). Pre-checks the allowance pool; 402/blocked if exhausted *(Live session pre-call)*.
- `POST /api/elevenlabs/webhook` — **server-side post-call webhook** (the integrity boundary). Receives the authoritative transcript + `duration_seconds` + structured rubric output, then: writes `evaluation` + `skill_score` rows, sets `session.status='scored'`, increments `allowance_period.consumed_seconds`, enqueues recompute jobs (recommendations, leaderboard, memory). **Never** accept scores from the browser.
- `GET  /api/sessions/:id/result` — the scored breakdown for the post-session screen: 8 skill scores, narrative, wins, misses, replacement phrases, recommended next scenario *(Results)*.
- `GET  /api/sessions?setter=me` — recent sessions list *(Dashboard, Progress)*.

## Setter — progress, trainings, coach
- `GET  /api/progress?setter=me&service=...` — per-skill trend over time + universal-skill profile *(Progress)*.
- `GET  /api/recommendations?setter=me` — active recommendations **with stored reason** *(Dashboard, Results, Trainings)*.
- `GET  /api/trainings?recommended=me` — recommended videos (drip-scheduled, every few days) + the catalog; include `unlock_at` for drip *(Trainings)*.
- `POST /api/trainings/:id/progress` — mark watched / workbook progress.
- `POST /api/coach/chat` — the "Help me say it better" chat. Proxies an LLM with a coaching system prompt + the setter's recent weak-skill context; returns the reply. *(Coach — chat)* The prototype calls an in-browser helper; production should proxy server-side so prompts/keys stay private. Optionally persist threads.
- `POST /api/coach/roleplay` — bootstrap a low-stakes coaching role-play (same ElevenLabs layer as a session, but **not scored / not metered the same**, with live coaching prompts) *(Coach — voice role-play)*.

## Leaderboards
- `GET  /api/leaderboard?scope=office&service=...` — ranked setters in the office *(Setter & Office leaderboard)*.
- `GET  /api/leaderboard?scope=global&service=...` — office/group standings, privacy-respecting (no cross-org individual names) *(Group standing, Platform global board)*. Fairness-weighted (avg/improvement, not volume).

## Office admin
- `GET  /api/office/overview` — team avg, active setters, sessions, set-rate, pool meter, "needs a nudge" *(Office Overview)*.
- `GET  /api/office/team` — each setter: usage hours, sessions, avg + trend, current recommendation/skill *(Team)*.
- `GET  /api/office/team/:setterId` — full score history, per-skill, recommendations + reasons, usage *(Setter detail)*.
- `GET  /api/office/services` · `PUT /api/office/services` — read/toggle offered services *(Service catalog)*.
- `PUT  /api/office/profile` — practice details used in role-play (name, city, offer, framing, deposit) *(Service catalog)*.
- `POST /api/office/invites` — invite setters by email (Resend); creates `invited` users *(Invite modal)*.
- `GET  /api/office/billing` — subscription (seats, cadence, price, discount), pool meter, invoices *(Usage & billing)*.
- `PUT  /api/office/billing` — change seats / cadence (→ Stripe subscription update).
- `POST /api/office/bundles` — purchase a conversation bundle via Stripe (5/10/20 hr); on success add `conversation_bundle` + bump `allowance_period.bundle_seconds` *(Bundle modal)*.

## Group / DSO admin
- `GET  /api/group/overview` — offices count, total setters, group avg, global rank, group pool *(Group overview)*.
- `GET  /api/group/offices` — per-office roll-up (setters, avg + trend, pool used, rank) *(Offices)*.
- `GET  /api/group/usage` — group pool + per-office usage breakdown *(Group usage)*.
- `POST /api/group/bundles` — group-level bundle purchase *(Group usage)*.

## Platform admin (Grow Dental internal)
- `GET  /api/platform/practices` — all offices: group, seats, avg, MRR, status; searchable *(Practices)*.
- `GET  /api/platform/agents` · `PUT /api/platform/agents/:id` — agent catalog (status, version, rubric, personas, sessions) + shared base config *(Agents)*.
- `GET  /api/platform/trainings` · `POST/PUT /api/platform/trainings/:id` — manage catalog, skill mapping, draft/publish *(Training catalog)*.
- `GET  /api/platform/metrics` — platform KPIs (practices, setters, sessions/mo, MRR) *(Practices KPI strip)*.

## Stripe webhooks
- `POST /api/stripe/webhook` — handle `invoice.paid`, `customer.subscription.updated`, `payment_intent.succeeded` (bundles). Keep `subscription` / `conversation_bundle` in sync; never grant time before payment confirmation.

---

## Background jobs (Trigger.dev)
1. **Score ingestion finalize** — after webhook insert: validate structured rubric, mark session scored (idempotent on `elevenlabs_conversation_id`).
2. **Recommendation recompute** — map weak skills (e.g. <4.0 over last N sessions) → published trainings; write `recommendation` rows **with reason**.
3. **Leaderboard recompute** — fairness-weighted, per scope + service; update `movement`.
4. **Memory summarization** — roll the setter's recent sessions into `setter_memory.summary`; adjust `difficulty_floor`.
5. **Allowance period reset** — open a new `allowance_period` each cycle; carry nothing/expire bundles per policy.

## Hard rules (carry into implementation)
- **Scores & durations: server-only**, from the ElevenLabs post-call webhook. Browser is never trusted (leaderboards depend on it).
- **No auto-overage** — block sessions when the pool is empty; require a bundle or period reset.
- **No PHI** — personas are fictional/AI-generated; store employee-performance + practice-business data only.
- **SetMo does not compute scores** — it ingests and mirrors the agent's rubric.
- **Scope by service type** for any score comparison/leaderboard.
