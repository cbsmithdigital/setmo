# SetMo — Product Requirements Document

**Product:** SetMo (a Grow Dental AI product)
**Version:** 1.3 (draft)
**Date:** June 7, 2026
**Status:** Foundation scope approved; ready for design + build
**Purpose:** Master reference for the SetMo design brief (Claude Design) and technical spec (Claude Code). Everything here is product-level intent; implementation detail lives in the technical spec.

---

## 1. Overview

SetMo is a web-based training platform that lets dental appointment setters and front-desk staff practice high-value lead conversations against a realistic AI patient, get objectively scored, receive targeted coaching, and track their improvement over time — with team and cross-practice benchmarking.

The name is short for **"set more"** — set more appointments. SetMo is the sibling to Grow Dental's flagship product: where the flagship AI *makes and answers* the calls automatically, **SetMo trains the humans to make those calls better.** Same DNA (AI for dental lead conversion), different application (coaching rather than autonomous calling).

### The problem
Appointment setters are the gatekeepers to high-ticket dental revenue (implants, full arch, dentures, cosmetic). Most practices train them inconsistently, can't measure skill objectively, and can't let new hires practice on real leads because every fumbled live call is lost revenue. There is no safe, repeatable, measurable way to build the skill.

### The solution
A logged-in web app where a setter starts a voice conversation with an AI that role-plays a difficult, unpredictable dental lead. The AI scores the call against a structured rubric, delivers spoken feedback, and SetMo turns that into a progress record, specific training recommendations (with the reasoning attached), and leaderboards that motivate the team.

---

## 2. Goals & success metrics

**Product goals**
- Give setters a safe, unlimited-feeling way to build lead-conversion skill.
- Give practice owners objective visibility into each setter's skill and growth.
- Make improvement measurable, specific, and motivating.

**Candidate success metrics** (to refine post-launch)
- Setter skill trend: average rubric score rising over successive sessions.
- Engagement: active call time per seat per month (target: most of the 3 included hours used).
- Business outcome (customer-side): improved live set rate after adopting SetMo.
- Retention: logo and seat retention, annual-plan adoption.

---

## 3. Users & roles

| Role | Who | Can do |
|---|---|---|
| **Platform Admin** | Grow Dental team | Full access; manage the training catalog and agents; run and view the global leaderboard; manage practices and billing. |
| **Distributor** | A channel-partner organization (reseller/agency) with a distribution relationship | Sign up new practices and DSOs; oversee the Consultants operating under it; view the accounts across its network. Manually approved; commission/rev-share is an optional per-partner toggle set at approval. |
| **Consultant** | An individual channel partner (independent or under a Distributor) | Sign up and support practices/DSOs; view and help manage the accounts they brought on. |
| **Group / DSO Admin** | Multi-location organization owner | Oversee all offices in their group; see group-wide usage, recommendations, and the group's standing on the global leaderboard. |
| **Office Admin** | Single-practice owner/manager | Register the practice; select services offered; invite and manage setters; see team usage, scores, and recommendations with reasons; office leaderboard. |
| **Setter** | Appointment setter / front-desk trainee | Run training sessions; see own scores, progress over time, and assigned trainings with reasons; office leaderboard standing. |

A Group/DSO is an optional parent over multiple Offices. A single independent practice is just an Office with no parent group. Distributors and Consultants form a partner/channel layer *above* the customer accounts: a Distributor may have multiple Consultants, and either can sign up and support practices and DSOs.

---

## 4. Core concepts (domain model — conceptual)

The technical spec defines the database schema; these are the product-level entities.

- **Organization / Group** — optional parent over multiple offices (DSOs, multi-location).
- **Distributor** — a channel-partner organization with a distribution relationship; may have multiple Consultants and manages a network of customer accounts.
- **Consultant** — a partner user (independent or under a Distributor) who signs up and supports customer accounts.
- **Managed-accounts link** — associates a Distributor/Consultant with the Offices and DSOs they signed up or support (their book of business).
- **Partner status & commission** — each Distributor/Consultant has an approval status (pending → approved) and a commission setting (on with terms, or off), both set by the SetMo team at approval.
- **Office / Practice** — the customer account; owns its setters, selected services, branding details, and billing.
- **User** — a person with one of the four roles above.
- **Service type** — a category of dental call (implants/full-arch, dentures/snap-in, cosmetic/veneers, ortho/Invisalign, wisdom teeth, general). Each maps to one specialized agent and rubric.
- **Session** — one practice conversation. Records the service type, persona used, transcript reference, timestamp, duration, and the resolved score.
- **Evaluation / Score** — the rubric result for a session: per-skill scores plus narrative feedback. Produced by the agent, ingested by SetMo (SetMo does not compute scores).
- **Skill** — a scored dimension. Two tiers: **universal skills** present in every rubric (rapport, listening, objection handling, confidence, closing) and **service-specific skills** (e.g., pain-point exploration for implants, vision-casting for cosmetic).
- **Training** — a piece of coaching content SetMo can recommend.
- **Recommendation** — a link from a weak skill to a Training, **with the stored reason** for the recommendation.
- **Memory** — a per-setter, SetMo-owned summary of past sessions, injected into future sessions for continuity and adaptive difficulty.
- **Usage allowance / pool** — the practice's (or group's) monthly pool of active call time: seats × 3 hours, plus any purchased bundles. Drawn down by the summed duration of sessions.
- **Conversation bundle** — a prepaid block of additional training time an Office or Group Admin buys to top up the allowance pool.
- **Leaderboard** — a computed ranking, scoped by office and globally, and by service type.

---

## 5. The conversational agent

The training conversation runs on **ElevenLabs** voice agents, embedded in the browser via the ElevenLabs web SDK (the setter is logged in, so the conversation is in-app, not a phone call).

**One agent per service type, not per practice.** Each agent is a specialized role (implants, dentures, cosmetic, ortho, wisdom teeth, general). At the start of each session, the agent is parameterized with the specific practice's details (office name, city, offers/voucher policy, allowed services, and the setter's memory summary) via session overrides. Total agents ≈ number of service types, regardless of how many practices sign up.

**Shared base + per-service modules.** Agents are composed from a shared base (voice-first realism, the internal trust-meter mechanic, character-lock/anti-break protocol, the feedback format, and end-of-session contact handling) plus a per-service module (that service's persona library, objection library, call flow, value statements, and scoring rubric). The base is the single source of truth maintained once and reused.

**Scoring lives in the agent.** The agent role-plays the lead, then on a feedback trigger delivers a structured assessment. The implant agent's rubric is the reference standard: eight categories scored 1–5 — rapport & warmth, listening & empathy, discovery/uncovering the "why," pain-point exploration, objection handling, confidence & leadership, value building, and closing — each with reasoning, plus narrative feedback, specific wins, specific misses, replacement phrases, persona-specific coaching, and a recommended next scenario.

**v1 ships the implant/full-arch/denture agent only** (the most complex call type, already built). Additional service agents are added incrementally without changing the platform.

---

## 6. How a session works (primary flow)

1. Setter logs in and chooses to start a practice session (service type available to their office).
2. SetMo's backend creates the session and launches the ElevenLabs agent with overrides: the office's allowed services and details, a persona/difficulty seed, and the setter's memory summary.
3. The voice conversation runs in the browser. The agent role-plays the lead; the setter practices; the setter triggers feedback at the end.
4. The agent produces the scored assessment. SetMo captures the authoritative transcript and score **server-side** (not from the browser) so results can't be tampered with — important because leaderboards depend on them.
5. SetMo stores the session against the logged-in setter, updates their progress, runs the recommendation logic, and refreshes leaderboards.

---

## 7. Functional requirements by area

### 7.1 Practice onboarding
- Office Admin registers a practice (or is provisioned under a Group).
- Office Admin selects which **services the practice provides**. This both gates which agents the office's setters can train on and feeds the agent's allowed services at session time.
- Office configures practice details used in role-play (name, city, offer/voucher or deposit policy, available appointment framing).

### 7.2 Setter accounts
- Office Admin invites setters by email (Resend-powered invites).
- Setter accepts, sets up their account, and lands on their dashboard.

### 7.3 Training session
- Setter starts a session for an available service type.
- In-browser voice conversation with the specialized agent, parameterized per practice and per setter.
- Usage is metered by conversation time and draws down the practice's monthly allowance pool (seats × 3 hours, plus any purchased bundles). When the pool is exhausted, new sessions are blocked until the period resets or a bundle is purchased — no automatic overage.

### 7.4 Scoring & feedback
- After each session, the setter sees their scored breakdown (per-skill, 1–5), the narrative feedback, wins, misses, replacement phrases, and the recommended next scenario.
- Scores are stored against the universal + service-specific skill taxonomy.

### 7.5 Progress tracking
- Setter sees skill scores over time, per service type.
- A cross-service "universal skill profile" shows how transferable skills (e.g., closing) trend across all call types.

### 7.6 Training recommendations
- SetMo maps weak skills to trainings in the catalog and surfaces them to the setter, **with the reason** ("recommended because your objection-handling scored 2/5 on the last two sessions").
- Office Admin can see which trainings each setter was recommended and why.

### 7.7 Office dashboard
- Usage per setter and for the practice overall — hours of active call time used against the pooled allowance, with low-balance warnings.
- Purchase conversation bundles to top up the allowance (Office and Group Admins).
- Each setter's score trend and current recommendations with reasons.
- Office (internal) leaderboard.

### 7.8 Leaderboards
- **Office leaderboard:** ranks the practice's own setters (names visible internally).
- **Global leaderboard:** ranks offices/groups across the platform; privacy-respecting (office/group-level standings, not individual setter names across organizations).
- **Scoped by service type** (an implant score and a cosmetic score are not comparable); a universal-skill cross-service view is possible.
- **Ranking is fairness-weighted** — based on average score or improvement, not raw session volume, so high-volume practices don't auto-win.

### 7.9 Memory & adaptive difficulty
- SetMo owns a per-setter memory summary and injects it into each new session for continuity.
- Because the backend knows a setter's history, persona difficulty can escalate as the setter improves rather than being purely random.
- Foundation for a future consultative "coach mode" (an agent that reviews and advises rather than role-plays).

### 7.10 Usage, allowance & purchases
- The practice/group sees its monthly allowance pool (seats × 3 hours), current consumption, and remaining time, with low-balance warnings.
- Active call time is counted from each session's duration in the ElevenLabs post-call webhook.
- Office and Group Admins can buy conversation bundles (prepaid time top-ups) that stack on the allowance, via Stripe.
- Seat count and billing cadence (monthly or quarterly) are managed here.

### 7.11 Partner channel (Distributor & Consultant)
- Consultants (and Distributors) can **sign up new practices or DSOs** — provisioning the customer account, setting initial configuration, and inviting the office/group admin.
- They can view and help support the accounts they manage (their book of business); the exact access level (view-only vs act-on-behalf) is to be confirmed.
- A Distributor additionally manages the Consultants operating under it and sees network-wide rollups.
- Partners are **manually approved** by the SetMo team. Approval is where a partner is activated and their **commission / revenue-share toggle** is set — on (with terms) or off — per partner, since some want it and others cannot accept it.
- When commission is on, the system attributes the partner's managed accounts for payout. Payouts can be handled manually to start (Stripe Connect automation is a later option).

---

## 8. Scope & phasing

| Phase | Theme | Includes |
|---|---|---|
| **1 — Foundation (v1, build now)** | Get sessions landing correctly | Auth & roles; Organization→Office→Setter model; service selection; the in-browser implant-agent session; server-side score capture; setter sees their own scored result; Stripe billing (monthly/quarterly), usage metering by call time, and conversation-bundle purchases. |
| **2 — Coaching** | Make scores actionable | Recommendation engine + reasons; progress-over-time charts; memory/continuity. |
| **3 — Office control** | Give admins visibility & control | Office admin dashboard (usage, recommendations + why); service-catalog configuration feeding the agent. |
| **4 — Competition** | Motivate | Office leaderboard, then the global cross-office/group leaderboard. |
| **Later** | Expansion | Additional service-type agents (cosmetic, ortho, wisdom teeth, general); **Secret Shopper** as a separate outbound product (AI calls real offices to evaluate live front-desk staff); the full **partner portal** (Distributor/Consultant self-serve sign-up and management). The partner role and account attribution exist in the data model from v1; the self-serve portal lands here. |

**Explicitly out of scope for v1:** phone-based training (web-only), secret shopper, service agents beyond implant/full-arch/denture, the full training catalog (structure built; content added in Phase 2).

---

## 9. Pricing & packaging

- **Per seat:** $59.99 / seat / month.
- **Volume discounts:** 10% off at 10–14 seats; 15% off at 15–20 seats; **over 20 seats (multi-location / DSO): contact us** (custom).
- **Included allowance:** 3 hours of active call training per seat per month. Usage is measured by **actual conversation time** (call duration from the ElevenLabs post-call webhook), not by a fixed session count, since sessions vary in length. The allowance **pools** at the practice (or group) level: total included time = seats × 3 hours.
- **Metering:** each session's duration is summed and drawn down against the pool, with low-balance warnings. When the pool is exhausted, new sessions are blocked until the period resets or more time is purchased — there is **no automatic/surprise overage billing**.
- **Conversation bundles (add-on):** Office and Group Admins can purchase additional training time in prepaid bundles that top up the pool (denominated in hours, e.g., +5 / +10 / +20 hours, to stay consistent with time-based metering). Bundles are one-time Stripe purchases priced above the time cost (~$9 per call-hour at the current rate) and stack on the included allowance. Exact bundle sizes and prices live in the pricing model.
- **Billing cadence:** monthly or quarterly (no annual option). Quarterly is billed upfront for the period and may carry a modest discount to encourage commitment (to be finalized).
- **Guarantee:** 30-day money-back guarantee (in place of a free trial).
- **Billing system:** Stripe (seat-based subscriptions, monthly/quarterly cadence, one-time bundle purchases, refunds).
- **Positioning:** value-based — one extra booked high-ticket consult is worth far more than the subscription. Cost basis is ~$0.15/min of conversation; the pricing/margin model is maintained separately.

---

## 10. Tech stack (summary; details in technical spec)

- **Next.js on Vercel** — web app + API
- **Neon** — primary Postgres database
- **Supabase** — authentication and file storage
- **Trigger.dev** — background jobs (score ingestion, recommendation & leaderboard recompute, memory summarization)
- **Resend** — transactional email
- **Stripe** — billing (monthly/quarterly seat subscriptions + one-time conversation-bundle purchases)
- **ElevenLabs** — conversational agents (web SDK + server-side session bootstrap and score capture)
- **GitHub** — source control
- **Railway** — any worker/long-running service outside Vercel's serverless model

---

## 11. Branding

SetMo inherits the Grow Dental AI design system so it reads as part of the family.

- **Primary:** brand purple `#8b5cf6` → `#7c3aed` (135° gradient); full 50–900 scale.
- **Surfaces (dark UI):** `#08080f` page through `#0d0d18`, `#121220`, `#1a1a2e`, `#24243a` (raised cards).
- **Success / progress / leaderboard accent:** mint `#34d399` / `#10b981`.
- **Text:** `#e2e8f0` primary, `#94a3b8` muted; error `#ef4444`.
- **Type:** Lato (Black) for headings (−0.03em tracking), DM Sans for body.
- **Feel:** dark theme, layered purple-glow shadows, gradient buttons, spring easing, subtle noise texture, gradient-text for large numbers; radius scale 6/10/12/16/24/full; 1280px max width.
- **SetMo signature within the system:** purple is the brand thread; **mint is the achievement color** (progress, streaks, leaderboard wins), and the gradient-number treatment is used for scores and progress.

Logo assets to be provided; a Lato Black wordmark works as a placeholder.

---

## 12. Non-goals & constraints

- **No HIPAA / PHI scope.** All personas are fictional and AI-generated; no real patient data is used or stored. SetMo handles employee performance and practice business data only.
- **Web-only training in v1.** No phone dialing for the training product.
- **SetMo does not compute scores** — it ingests them from the agent and mirrors the rubric.
- **Score integrity:** official scores are recorded server-side, never trusted from the client.

---

## 13. Open items & dependencies

- **Training catalog content** — the trainings offered and which skill each targets (needed for Phase 2; schema built in v1).
- **ElevenLabs structured score output** — confirm whether the implant agent already emits structured fields for the eight rubric categories or whether those need to be configured for clean ingestion.
- **Logo assets** for SetMo / Grow Dental.
- **Database split** — default is Neon (app data) + Supabase (auth/storage); confirm or consolidate onto Supabase.
- **Conversation bundle sizes & prices**, and whether quarterly carries a discount — to finalize in the pricing model.
- **Partner payouts** — commission is a resolved per-partner toggle set at manual approval; the remaining opens are the exact commission *rate structure* and whether payouts are manual (v1 default) or automated later via Stripe Connect.
- **Partner structure & access** — whether a Distributor strictly parents Consultants or they can be independent, and a Consultant's access level into managed accounts (view vs act-on-behalf).

---

## 14. Glossary

- **Setter** — appointment setter / front-desk trainee; the primary end user.
- **Session** — one practice conversation with the AI lead.
- **Persona** — the AI's randomized lead character (type, difficulty, hidden "why").
- **Rubric** — the per-service scoring framework the agent uses.
- **Universal vs service-specific skills** — skills shared across all call types vs unique to one.
- **Secret Shopper** — future separate product where the AI calls real offices to evaluate live staff.
