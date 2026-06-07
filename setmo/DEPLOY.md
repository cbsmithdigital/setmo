# Deploying SetMo for live testing

Target stack: **Vercel** (app) · **Supabase** (Postgres + Auth) · **Stripe** (billing) ·
**ElevenLabs** (voice) · **Resend** (invite email). Trigger.dev is **not required** for
testing — score ingestion runs inline in the webhook.

The app lives in the **`setmo/` subdirectory** of this repo. Set that as the Vercel
**Root Directory** (see step 6).

---

## 0. Accounts you need to create

| Service | Why | Free tier OK for testing? |
|---|---|---|
| **Vercel** | hosting | yes |
| **Supabase** | Postgres + Auth + storage | yes |
| **Stripe** | seat subscriptions + bundles | yes (test mode) |
| **ElevenLabs** | the AI patient (voice) | needs a paid plan + the implant agent |
| **Resend** | setter invite emails | yes (needs a verified domain to send) |
| **GitHub** | source → Vercel | yes |

---

## 1. Push to GitHub
Create a repo and push this project. Vercel deploys from it.

## 2. Supabase
1. Create a project. From **Project Settings → API**: copy the Project URL, the `anon`
   public key, and the `service_role` key.
2. From **Project Settings → Database → Connection string**: copy both
   - **Transaction pooler** (port 6543, append `?pgbouncer=true`) → `DATABASE_URL`
   - **Direct/session** (port 5432) → `DIRECT_URL`
3. **Auth → URL Configuration**: set **Site URL** to your deploy URL and add
   `https://<your-domain>/auth/confirm` to **Redirect URLs** (also add the Vercel preview
   domain if you want invites to work on previews).
4. Apply the schema + seed against this database (run locally with the prod connection
   strings in your shell):
   ```bash
   cd setmo
   DATABASE_URL=... DIRECT_URL=... pnpm db:push
   DATABASE_URL=... DIRECT_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm db:seed
   ```
   Seeding creates demo logins (password `SetMo-demo-2026`, e.g. `sam@brightworkdental.com`).
   For real testers instead, skip the seed and invite them from the Office Admin → Usage &
   billing screen once deployed.

## 3. ElevenLabs  ⚠️ the one real dependency
1. Create (or reuse) the **implant/full-arch/denture agent**. Copy its **agent id** →
   `ELEVENLABS_AGENT_IMPLANT`. Copy your **API key** → `ELEVENLABS_API_KEY`.
2. The agent must accept these **dynamic variables** (we pass them at session start):
   `session_id`, `setter_first_name`, `office_name`, `office_city`, `offer_framing`,
   `appointment_framing`, `deposit_policy`, `allowed_services`, `memory_summary`, `difficulty`.
3. **Post-call webhook**: point it at `https://<your-domain>/api/webhooks/elevenlabs`, copy
   the signing secret → `ELEVENLABS_WEBHOOK_SECRET`.
4. **Structured scores:** the webhook expects the 8 rubric scores in the agent's
   `data_collection_results` (preferred, numeric) or `evaluation_criteria_results`, keyed by
   skill (`rapport`, `listening`, `discovery`, `painpoint`, `objection`, `confidence`,
   `value`, `closing`), plus optional `wins`, `misses`, `replacement_phrases`,
   `persona_coaching`, `recommended_next_scenario`. If the agent only *speaks* the scores,
   configure data-collection fields in ElevenLabs (the parser in `src/lib/elevenlabs.ts` is
   tolerant, and `rawPayload` is always stored so nothing is lost while mapping). Until this
   emits structured data, results screens won't populate from real calls.

## 4. Stripe (test mode is fine)
1. Copy **Secret key** → `STRIPE_SECRET_KEY` (use a `sk_test_…` key for testing).
2. **Developers → Webhooks → Add endpoint**: `https://<your-domain>/api/webhooks/stripe`.
   Subscribe to: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
3. No need to pre-create products/prices — bundles and seats use inline price data.
4. Refunds (30-day guarantee) are issued from the Stripe dashboard for now.

## 5. Resend
Add and **verify a sending domain**, create an API key → `RESEND_API_KEY`, and set
`RESEND_FROM_EMAIL` (e.g. `SetMo <noreply@yourdomain.com>`). Without this, invites still work
in a dev fallback — the invite link is shown in the modal instead of emailed.

## 6. Vercel
1. **New Project → import the GitHub repo.**
2. **Root Directory: `setmo`.** Framework preset: Next.js (auto). Build command stays default
   (`pnpm build`, which runs `prisma generate && next build`).
3. Add **all environment variables** (below) under Project → Settings → Environment Variables.
4. Deploy.

## 7. After the first deploy
1. Set `NEXT_PUBLIC_APP_URL` to the real deploy URL and redeploy (used in webhook redirect
   URLs and Checkout return URLs).
2. Point the **Supabase redirect URL**, **ElevenLabs webhook**, and **Stripe webhook** at the
   real domain (steps 2–4) if you used a placeholder.
3. Hit **`https://<your-domain>/api/health`** — it returns which integrations are wired and
   whether the DB is reachable (no secrets). Aim for `{ "ok": true }`.
4. Log in with a seeded account (or invite a tester) and run the loop:
   dashboard → practice → live call → results.

---

## Environment variables (set all in Vercel)

```
DATABASE_URL                      Supabase pooled (6543, ?pgbouncer=true)
DIRECT_URL                        Supabase direct (5432) — for migrations
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY         server-only
ELEVENLABS_API_KEY
ELEVENLABS_AGENT_IMPLANT
ELEVENLABS_WEBHOOK_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
NEXT_PUBLIC_APP_URL               https://<your-domain>
```

See `.env.example` for the annotated source of truth.

---

## Notes / caveats
- **Prisma 7** uses the query compiler + `pg` driver adapter (no native engine), so it runs
  cleanly on Vercel serverless. `prisma generate` runs in the build step.
- **Inline ingestion:** the ElevenLabs webhook does the scoring work synchronously and is
  idempotent. Fine for testing. If post-call processing grows heavy, move
  `src/lib/ingest.ts` onto Trigger.dev (the seam is already isolated) and add `TRIGGER_*`.
- **Region:** put the Vercel project in the same region as your Supabase project to keep
  query latency low.
- **No PHI** is stored — personas are fictional; this is employee-performance + business data.
