# SetMo

**Set more appointments.** A web app where dental appointment setters practice high-value
lead calls against a realistic AI patient, get objectively scored on an 8-skill rubric,
receive coaching, and track improvement — with team and cross-practice leaderboards.
A Grow Dental AI product.

This repo is the implementation of the SetMo PRD / Technical Spec / Design Brief and the
Claude Design handoff (both live one level up in `../`).

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) + **Tailwind v4**
- **Supabase** — Postgres (via **Prisma 7** + `@prisma/adapter-pg`), Auth, Storage
- **ElevenLabs** — in-browser conversational voice (`@elevenlabs/react`) + server-side
  signed-URL bootstrap and post-call webhook score capture
- **Stripe** — seat subscriptions + conversation bundles · **Resend** — invites ·
  **Trigger.dev** — background jobs

> Single Next.js app (the spec-approved v1 simplification) with internal module folders
> mirroring the intended packages: `src/lib/{db,elevenlabs,coaching,usage,ingest,...}`.

## What's built (Milestone 1 — runnable shell + setter core loop)

- Grow Dental dark design system ported faithfully from the prototype (`globals.css`).
- Full Prisma schema covering all phases (`prisma/schema.prisma`) + seed mirroring the
  prototype data (`prisma/seed.ts`).
- Supabase auth + role-aware shell, RBAC data-access layer (`src/lib/auth.ts`), and the
  Next 16 `proxy.ts` session gate.
- **Setter core loop**, end to end:
  - Login → Dashboard → Service picker → **Live session** (ElevenLabs) → **Results**.
  - `POST /api/sessions` (bootstrap) · `POST /api/sessions/:id/connect` (mint signed URL +
    server-built overrides) · `POST /api/webhooks/elevenlabs` (**authoritative**,
    signature-verified score capture) → ingestion → evaluation + skill scores + usage
    drawdown + recommendation recompute.
  - Office leaderboard (real data). Progress / Trainings / Coach / Office dashboard +
    team + catalog screens are phased "coming soon" stubs wired into the nav.
- **Phase 1 billing (Office Admin):** real Usage & Billing screen — pooled-allowance meter,
  plan summary with volume discount, conversation-bundle purchase via **Stripe Checkout**,
  and the signature-verified `POST /api/webhooks/stripe` that credits the bundle to the pool
  and syncs seats. Invoices read from Stripe when wired up.
- **Setter invites + onboarding:** Office Admin invites by email (`POST /api/office/invites`,
  Resend-delivered Supabase invite links) → `/auth/confirm` establishes the session →
  `/invite` set-up screen → `POST /api/auth/accept-invite` activates the account.

## Getting started

```bash
pnpm install
cp .env.example .env.local      # then fill in real values (see below)

pnpm db:push                    # apply the Prisma schema to Supabase Postgres
pnpm db:seed                    # seed demo org/office/setters/sessions (creates auth users)

pnpm dev                        # http://localhost:3000
```

### Required env (`.env.local`)

See `.env.example` for the full, commented list. Minimum to run the app + log in:

- `DATABASE_URL` (Supabase **pooled**, port 6543, `?pgbouncer=true`) and
  `DIRECT_URL` (Supabase **direct**, port 5432 — used by migrations).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

To run a **live practice call**, also set:
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_IMPLANT`, and `ELEVENLABS_WEBHOOK_SECRET`
  (the webhook is the only path that writes scores). Point the ElevenLabs post-call
  webhook at `POST /<app-url>/api/webhooks/elevenlabs`.

### Demo logins

After `pnpm db:seed` (with Supabase keys set), password for all accounts is
`SetMo-demo-2026`:

- Setter: `sam@brightworkdental.com`
- Office admin: `lena@brightworkdental.com`

## Scripts

| Script | Does |
|---|---|
| `pnpm dev` / `build` / `start` | Next dev / production build / serve |
| `pnpm lint` | ESLint |
| `pnpm db:push` | Push Prisma schema to the DB (no migration history) |
| `pnpm db:migrate` | Create + apply a migration |
| `pnpm db:seed` | Seed demo data + Supabase auth users |
| `pnpm db:studio` | Prisma Studio |

## Architecture notes

- **Score integrity:** scores and durations are written server-side only, from the
  ElevenLabs post-call webhook — never trusted from the browser (leaderboards depend on it).
- **No auto-overage:** sessions are blocked when the pooled allowance is exhausted.
- **No PHI:** personas are fictional; only employee-performance + practice-business data.
- The Prisma client is a **lazy proxy** (`src/lib/db.ts`) so `next build` doesn't require
  DB env to collect routes.
- Ingestion runs inline in the webhook for v1 (idempotent); it's structured to move onto
  Trigger.dev unchanged (`src/lib/ingest.ts`).
