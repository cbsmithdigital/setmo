# SetMo — Technical Specification (for Claude Code)

**Product:** SetMo (a Grow Dental AI product)
**Companion to:** SetMo PRD v1.3 and SetMo Design Brief (product behavior and UI live there)
**Date:** June 7, 2026
**Audience:** Claude Code (implementation). This describes architecture, data model, and contracts at the level needed to build; it is not finished code.

---

## 1. Architecture overview

SetMo is a logged-in web app. A setter starts a session, the voice conversation runs in their browser via the ElevenLabs web SDK, and the **authoritative score is captured server-side** from ElevenLabs' post-call webhook. Async work (score processing, recommendations, leaderboards, memory, usage rollover) runs on Trigger.dev.

```
Browser (Next.js, ElevenLabs React SDK)
   │  start session
   ▼
Next.js API (Vercel)  ──signed URL + overrides──►  ElevenLabs agent (per service type)
   │  create Session                                      │
   │                                            post-call webhook (transcript, scores, duration)
   ▼                                                      ▼
Neon Postgres  ◄────  Trigger.dev jobs  ◄──────  /api/webhooks/elevenlabs
   ▲                    (ingest score, recommend, leaderboard, memory, usage)
   │
Supabase (auth, storage) · Stripe (billing) · Resend (email)
```

---

## 2. Tech stack

- **Next.js (App Router) + TypeScript** on **Vercel** — UI and API route handlers.
- **Neon (Postgres)** — primary database, accessed via **Prisma** ORM.
- **Supabase** — authentication and file storage.
- **Trigger.dev** — background jobs and scheduled tasks.
- **Resend** — transactional email.
- **Stripe** — subscriptions (monthly/quarterly), one-time bundle purchases, refunds.
- **ElevenLabs** — conversational agents; `@elevenlabs/react` (`useConversation`) in the browser, REST API server-side for signed URLs and conversation fetch.
- **Tailwind CSS** — implements the Grow Dental design tokens (see Design Brief).
- **Recharts** — progress and skill charts.
- **GitHub** — source control. **Railway** — any long-running worker not suited to serverless.

> **Open decision:** default is Neon for app data + Supabase for auth/storage. If consolidating onto Supabase Postgres, point Prisma at Supabase and drop Neon.

---

## 3. Repo structure

A pnpm + Turborepo monorepo (a single Next.js app with internal module folders is an acceptable v1 simplification):

```
setmo/
├── apps/
│   └── web/                # Next.js App Router: UI + API route handlers
├── packages/
│   ├── db/                 # Prisma schema + generated client (Neon)
│   ├── elevenlabs/         # signed-URL session bootstrap, webhook parsing, score→skill mapping
│   ├── coaching/           # recommendation engine, progress, leaderboard computation
│   ├── billing/            # Stripe subscriptions, bundles, usage metering
│   ├── memory/             # per-setter memory summarization + injection
│   └── ui/                 # design-system tokens + shared components
├── jobs/                   # Trigger.dev job definitions
├── agents/                 # ElevenLabs prompts: shared base + per-service modules (source of truth)
├── docs/                   # PRD, design brief, this spec
└── (config: turbo.json, package.json, .env.example, etc.)
```

---

## 4. Data model

Pseudo-schema (Prisma-style). All tenant-scoped tables carry `officeId` (and `organizationId` where relevant); the data-access layer must enforce scoping by the requester's role.

```
Organization { id, name, type(GROUP|INDEPENDENT), createdAt }

Office {
  id, organizationId?, name, city,
  offerPolicy(json),            // voucher/deposit config used in role-play
  seatCount(int),
  stripeCustomerId?, createdAt
}

User {
  id,                            // = Supabase auth user id
  email, firstName, lastName,
  role(PLATFORM_ADMIN|DISTRIBUTOR|CONSULTANT|GROUP_ADMIN|OFFICE_ADMIN|SETTER),
  officeId?, organizationId?, partnerId?,
  status(INVITED|ACTIVE|DISABLED), createdAt
}

Partner {                                             // channel partner: distributor org or independent consultant
  id, name, type(DISTRIBUTOR|INDEPENDENT_CONSULTANT),
  status(PENDING|APPROVED|DISABLED),                  // manual approval by Platform Admin
  commissionEnabled(bool), commissionTerms(json?),    // per-partner toggle + terms, set at approval
  createdAt
}

ManagedAccount {                                      // a partner's book of business
  id, partnerId, consultantUserId?, officeId?, organizationId?
}

ServiceType {
  id, key(IMPLANTS|DENTURES|COSMETIC|ORTHO|WISDOM|GENERAL),
  name, elevenlabsAgentId, active(bool)
}

OfficeService { officeId, serviceTypeId }            // services an office offers / can train on

Skill {
  id, key, name,
  scope(UNIVERSAL|SERVICE_SPECIFIC),
  serviceTypeId?                                      // null when universal
}

RubricMapping {                                       // agent category -> skill, per service
  serviceTypeId, agentCategoryKey, skillId
}

Session {
  id, setterId, officeId, serviceTypeId,
  personaSeed(json), difficulty,
  status(STARTED|COMPLETED|FAILED),
  elevenlabsConversationId?,
  startedAt, completedAt?, durationSeconds?, transcriptRef?
}

Evaluation { id, sessionId, overallScore?, narrative(text), rawPayload(json), createdAt }

SkillScore { id, sessionId, skillId, score(1..5), rationale(text) }

FeedbackItem {                                        // wins, misses, replacement phrases, etc.
  id, evaluationId,
  type(WIN|MISS|REPLACEMENT_PHRASE|PERSONA_COACHING|NEXT_SCENARIO),
  text
}

Training { id, title, description, contentRef }
TrainingSkill { trainingId, skillId }                 // which skills a training addresses

Recommendation {
  id, setterId, sessionId?, skillId, trainingId,
  reason(text), status(NEW|SEEN|COMPLETED), createdAt
}

UsagePeriod {                                         // monthly, per office
  id, officeId, periodStart, periodEnd,
  baseMinutes(int),                                   // snapshot: seatCount * 180
  consumedMinutes(int)
}

BundleCredit {                                        // prepaid time top-ups
  id, officeId, minutesPurchased, minutesRemaining,
  stripePaymentId, purchasedAt, expiresAt?
}

Subscription {
  id, officeId, stripeSubscriptionId,
  seatCount, cadence(MONTHLY|QUARTERLY),
  status, currentPeriodEnd
}

SetterMemory { setterId, summary(text), updatedAt }

LeaderboardEntry {                                    // materialized
  id, scope(OFFICE|GLOBAL), serviceTypeId?,
  subjectType(SETTER|OFFICE|GROUP), subjectId,
  metric(AVG_SCORE|IMPROVEMENT), value(float),
  rank(int), periodKey, computedAt
}
```

---

## 5. Auth & roles

- **Supabase Auth** for identity (email invite + magic link or password).
- Roles per PRD §3. Enforce per-request authorization and **tenant isolation**: setters/office admins see only their office; group admins their organization's offices; partners (Distributor/Consultant) see only their managed accounts; platform admins all.
- **Partners are manually approved** by a Platform Admin, which sets `Partner.status = APPROVED` and configures the per-partner commission toggle (`commissionEnabled` / `commissionTerms`).
- **Invite flow:** Office/Group Admin creates a `User(status=INVITED)`, Resend sends an invite link, the user completes signup, status → ACTIVE.

---

## 6. ElevenLabs integration

### 6.1 Session bootstrap (start a session)
`POST /api/sessions/start { serviceTypeId }`
1. Authn/authz; confirm the office offers `serviceTypeId`; confirm the usage pool has time remaining (see §7).
2. Seed persona + difficulty (use `SetterMemory` / history to escalate difficulty adaptively; default random if no history).
3. Build conversation-initiation data / **dynamic variables**: `sessionId`, `setterId`, office name + city, allowed services, offer/voucher policy, persona seed, and the setter's memory summary.
4. Call the ElevenLabs REST API to mint a **signed conversation URL** for that service type's agent, carrying the overrides. (Signed URL — not a public agent — so only authenticated setters can start a session and our credits are protected.)
5. Create `Session(status=STARTED)`; return `{ sessionId, signedUrl }`.

Client runs the conversation with `@elevenlabs/react` `useConversation` using the signed URL. `sessionId` travels as a dynamic variable so the webhook can match the result back deterministically (identity is solved by login + this id; no caller matching needed).

### 6.2 Score capture (authoritative, server-side)
`POST /api/webhooks/elevenlabs`
1. **Verify the webhook signature.**
2. Enqueue a Trigger.dev job; return 200 quickly.
3. Job: read transcript, evaluation results, structured data-collection fields, and **call duration** from the payload (or fetch the conversation by id from the ElevenLabs API).
4. Match to `Session` via `sessionId`; set `status=COMPLETED`, `durationSeconds`, `elevenlabsConversationId`, `transcriptRef`.
5. Write `Evaluation` (+ `rawPayload`), map each agent category to a `Skill` via `RubricMapping` and write `SkillScore` rows, and write `FeedbackItem`s (wins/misses/replacement phrases/next scenario).
6. Draw down usage (§7), then trigger recommendation, leaderboard, and memory jobs.

> **Open dependency:** confirm the implant agent emits structured evaluation-criteria / data-collection fields for the eight categories. If it only speaks them, either configure structured outputs in ElevenLabs or parse them from the transcript in step 5. Never trust scores sent from the browser — only this server path is authoritative.

### 6.3 Agents
One agent per `ServiceType` (`elevenlabsAgentId`). Prompts are composed from a shared base + per-service module under `/agents` (source of truth). v1 ships the implants agent only.

---

## 7. Usage metering & billing

### 7.1 Metering (time-based, pooled)
- Allowance for an office in a period = `UsagePeriod.baseMinutes` (seatCount × 180) **plus** `sum(BundleCredit.minutesRemaining)`.
- On **session start**, block if remaining ≤ a minimum threshold; surface low-balance warnings as the pool runs down.
- On **score capture**, add `durationSeconds/60` to `consumedMinutes`; if base is exhausted, decrement `BundleCredit.minutesRemaining` (oldest first).
- **Monthly reset** (Trigger.dev scheduled): open a new `UsagePeriod` with fresh `baseMinutes`. **Open decision:** base minutes reset monthly; bundle minutes are prepaid — default is they persist until used (set `expiresAt` if you want them to expire).

### 7.2 Stripe
- **Seat subscription** with **monthly and quarterly** prices; model the volume discount (1–9 full, 10–14 −10%, 15–20 −15%) via Stripe volume/tiered pricing by quantity. **Over 20 seats is contact-us (manual), not self-serve.**
- **Conversation bundles** as one-time prices (denominated in hours/minutes); on successful payment, create a `BundleCredit`.
- **30-day money-back guarantee:** support refunds within 30 days via the Stripe refund API (note the COGS already consumed is not recoverable).
- **Stripe webhooks** (`/api/webhooks/stripe`, signature-verified) keep `Subscription` and seat counts in sync and create `BundleCredit`s.
- **Open decision:** whether quarterly carries a discount.

---

## 8. Coaching logic

- **Recommendation engine** (`packages/coaching`, run as a job after score capture): rules-based mapping from weak `SkillScore`s to `Training`s via `TrainingSkill`, writing a `Recommendation` with a human-readable `reason`. (Catalog content is a Phase-2 input; build the schema and a simple threshold rule now, e.g., score ≤ 2 on a skill across recent sessions → recommend a training tagged to that skill.)
- **Progress:** query `SkillScore` over time per setter, grouped by service type; expose a universal-skill profile across service types.
- **Leaderboards:** materialize `LeaderboardEntry` via a job; rank on `AVG_SCORE` or `IMPROVEMENT` (not volume); scope OFFICE and GLOBAL, by service type. Global rankings expose office/group standings only — **never individual setter names across organizations.**

---

## 9. Memory

`SetterMemory.summary` is SetMo-owned, updated by a job after sessions (summarize recent performance, weak areas, personas faced) and injected at session bootstrap (§6.1) as a dynamic variable. (An external memory service keyed to the setter id is an option, but the DB-owned summary is the default and the source of truth.)

---

## 10. Background jobs (Trigger.dev)

Score ingestion/processing · recommendation compute · leaderboard recompute (on new score and/or scheduled) · memory summarization · monthly usage-period reset · Stripe reconciliation.

---

## 11. Key API endpoints

- `POST /api/sessions/start` — bootstrap a session (§6.1)
- `POST /api/sessions/:id/ended` — optional client signal; authoritative result is the webhook
- `POST /api/webhooks/elevenlabs` — score capture (§6.2)
- `POST /api/webhooks/stripe` — billing sync (§7.2)
- `POST /api/invites` — invite a setter
- `GET /api/usage` — current pool, consumption, remaining
- `POST /api/bundles/checkout` — buy a conversation bundle
- `GET /api/setters/:id/progress` — score history
- `GET /api/leaderboards` — office/global, by service type
- Admin endpoints for office registration, service-catalog config, and team views
- `POST /api/partners/practices` — a Consultant/Distributor provisions a new practice or DSO and invites its admin
- `POST /api/admin/partners/:id/approve` — Platform Admin approves a partner and sets the commission toggle/terms

---

## 12. Security & multi-tenancy

- Enforce role-based access and office/organization scoping in a shared data-access layer.
- **Verify signatures** on both ElevenLabs and Stripe webhooks.
- Scores are authoritative only from the server webhook path, never the client.
- Secrets in environment config (§14); no secrets client-side beyond the short-lived signed URL.
- **No PHI** is collected or stored — personas are fictional; this is employee-performance and business data only.

---

## 13. v1 build order (foundation)

1. **Repo + infra:** monorepo, Prisma schema + Neon, Supabase auth, base Next.js app with the design tokens.
2. **Auth & tenancy:** roles, office registration, setter invites (Resend), scoped data access.
3. **Service catalog:** ServiceTypes seeded (implants live), OfficeService selection, practice details.
4. **Session bootstrap:** `/api/sessions/start` with signed URL + overrides; in-browser conversation via `@elevenlabs/react`.
5. **Score capture:** ElevenLabs webhook → Trigger.dev ingestion → Evaluation + SkillScores + duration; setter sees their scored result.
6. **Usage & billing:** metering against the pooled allowance, Stripe seat subscription (monthly/quarterly) + bundle purchases, money-back-guarantee refunds.

**Acceptance for v1:** an invited setter logs in, starts an implants session in-browser, completes it, and sees an accurate scored breakdown; the session's real duration is metered against the office's pooled allowance; an office admin can register, pick services, invite setters, see usage, subscribe, and buy a bundle.

Phases 2–4 (coaching, office dashboards, leaderboards) build on this schema without rework.

---

## 14. Environment & config

Group env vars by service: `DATABASE_URL` (Neon), `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, `ELEVENLABS_API_KEY` + per-service agent ids + `ELEVENLABS_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` + price ids, `RESEND_API_KEY`, `TRIGGER_*`. Provide a `.env.example`.

---

## 15. Open items

- **ElevenLabs structured score output** for the eight categories — confirm or configure (§6.2).
- **Neon vs Supabase Postgres** — confirm the split (§2).
- **Bundle minute expiry** and **quarterly discount** (§7).
- **Persona seeding** — confirm difficulty escalation logic vs pure random.
- **Training catalog** content for the recommendation engine (Phase 2).
- **Partner payouts** — commission is a per-partner toggle set at manual approval; open are the commission *rate structure* and whether payouts are manual (v1 default) or automated via Stripe Connect later.

---

## 16. Out of scope (v1)

Secret shopper (separate outbound product), service agents beyond implants, consultative coach mode, deep Group/DSO and Platform Admin tooling, and the partner self-serve portal (the partner roles, attribution, approval, and commission toggle exist in the v1 schema; the self-serve portal itself is later).
