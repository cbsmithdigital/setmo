# SetMo — Data Model (backend reference)

This is the conceptual schema for SetMo, derived from the PRD (`docs/SetMo_PRD.md` §4) and the shapes used in the prototype (`prototype/app/data.js`). Default stack is **Neon Postgres** for app data + **Supabase** for auth/storage. Column types are Postgres. Adjust naming to your conventions.

> Score integrity is the cardinal rule: **official scores and session durations are written server-side only** (from the ElevenLabs post-call webhook), never trusted from the browser. Leaderboards depend on this.

---

## Entity overview

```
organization (DSO/group, optional)
   └── office (practice)               ← the customer account / billing entity
         ├── office_service            ← which services this office offers (+ role-play details)
         ├── user (role=office_admin | setter)   ← via Supabase auth
         │     ├── session             ← one practice conversation
         │     │     └── evaluation     ← rubric result (8 skills + narrative)
         │     │           └── skill_score (per-skill row)
         │     ├── setter_memory       ← rolling summary injected into next session
         │     └── recommendation      ← weak skill → training, with stored reason
         ├── allowance_period          ← monthly/quarterly pool snapshot
         ├── conversation_bundle       ← purchased top-ups
         └── subscription              ← Stripe seat subscription
agent            ← one per service_type (platform-level, not per office)
training         ← catalog content (video/workbook), maps to a skill
leaderboard_entry (materialized/recomputed)
```

---

## Tables

### organization  *(optional parent — DSO / multi-location group)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text | "Meridian DSO" |
| created_at | timestamptz | |

A single independent practice has **no** organization — it's just an office with `organization_id = null`.

### office  *(the practice — customer account & billing entity)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| organization_id | uuid fk → organization | nullable |
| name | text | "Brightwork Dental" |
| city | text | used in agent role-play |
| offer_framing | text | e.g. "$500 off full-arch · free consult" |
| appointment_framing | text | e.g. "Free 30-minute implant consultation" |
| deposit_policy | text | e.g. "No deposit required to book" |
| created_at | timestamptz | |

### user
| column | type | notes |
|---|---|---|
| id | uuid pk | = Supabase auth user id |
| office_id | uuid fk → office | null for platform_admin |
| organization_id | uuid fk → organization | for group_admin |
| role | enum | `platform_admin` \| `group_admin` \| `office_admin` \| `setter` |
| full_name | text | |
| email | text unique | |
| status | enum | `invited` \| `active` \| `disabled` |
| invited_by | uuid fk → user | |
| created_at | timestamptz | |

**Roles & scope** (drive RBAC on every endpoint):
- `platform_admin` — Grow Dental staff; all offices, agents, training catalog, global leaderboard.
- `group_admin` — one organization; all its offices' usage/scores/standing.
- `office_admin` — one office; its setters, services, billing, leaderboard.
- `setter` — self only; own sessions, scores, recommendations, office leaderboard standing.

### service_type  *(reference / enum-like)*
`implant` (implant/full-arch/denture — **v1**), `cosmetic`, `ortho`, `wisdom`, `general`. Each maps to exactly one `agent`.

### office_service  *(which services an office offers)*
| column | type | notes |
|---|---|---|
| office_id | uuid fk | |
| service_type | text | |
| enabled | bool | gates which agents setters can train on + what the agent offers the lead |
| pk (office_id, service_type) | | |

### agent  *(one per service_type — platform-level)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| service_type | text unique | |
| status | enum | `live` \| `draft` \| `planned` |
| version | text | "v1.4" |
| elevenlabs_agent_id | text | the ElevenLabs voice agent to launch |
| rubric_skills | jsonb | ordered list of scored skills for this service (see Skill taxonomy) |
| persona_count | int | |
| note | text | |

**v1 ships only the `implant` agent.** Adding a service = inserting an agent row; the platform doesn't change.

### session  *(one practice conversation)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| setter_id | uuid fk → user | |
| office_id | uuid fk → office | denormalized for scoping/leaderboards |
| service_type | text | |
| agent_id | uuid fk → agent | |
| persona_seed | text/jsonb | difficulty + hidden "why" used (never shown pre-call) |
| difficulty | enum | `adaptive` \| `warm` \| `tough` |
| elevenlabs_conversation_id | text | correlate the post-call webhook |
| transcript_ref | text | storage pointer (Supabase storage) |
| started_at | timestamptz | |
| duration_seconds | int | **authoritative**, from post-call webhook |
| status | enum | `created` \| `in_progress` \| `scored` \| `failed` |

### evaluation  *(rubric result for a session — ingested, not computed)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| session_id | uuid fk unique | |
| overall_score | numeric(2,1) | 1.0–5.0 |
| narrative | text | |
| wins | jsonb (text[]) | specific wins |
| misses | jsonb (text[]) | specific misses |
| replacement_phrases | jsonb | `[{from, to}]` |
| persona_coaching | text | |
| recommended_next_scenario | text | |
| created_at | timestamptz | |

### skill_score  *(per-skill row for an evaluation)*
| column | type | notes |
|---|---|---|
| evaluation_id | uuid fk | |
| skill_key | text | see taxonomy |
| tier | enum | `universal` \| `service_specific` |
| score | numeric(2,1) | 1.0–5.0 |
| reasoning | text | |
| pk (evaluation_id, skill_key) | | |

**Skill taxonomy.** *Universal* (every rubric): `rapport`, `listening`, `objection`, `confidence`, `closing`. *Implant-specific* (v1 reference rubric, 8 total): adds `discovery`, `painpoint`, `value`. Store both tiers so progress can show a cross-service "universal skill profile."

### setter_memory  *(SetMo-owned continuity summary)*
| column | type | notes |
|---|---|---|
| setter_id | uuid fk unique | |
| summary | text | injected into each new session via override |
| difficulty_floor | enum | escalates as setter improves |
| updated_at | timestamptz | recomputed by a background job after each session |

### training  *(catalog content)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| title | text | |
| type | enum | `video` \| `workbook` |
| length | int | minutes (video) / pages (workbook) |
| target_skill_key | text | the rubric skill it improves |
| status | enum | `draft` \| `published` |
| asset_ref | text | storage pointer |

### recommendation  *(weak skill → training, with stored reason)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| setter_id | uuid fk | |
| training_id | uuid fk | |
| skill_key | text | the weak skill that triggered it |
| reason | text | **stored**: "objection-handling scored 2/5 on the last two sessions" |
| created_at | timestamptz | |
| status | enum | `active` \| `dismissed` \| `completed` |

### subscription  *(Stripe seat subscription)*
| column | type | notes |
|---|---|---|
| office_id | uuid fk | |
| stripe_customer_id | text | |
| stripe_subscription_id | text | |
| seats | int | |
| cadence | enum | `monthly` \| `quarterly` |
| price_per_seat | numeric | 59.99 |
| status | enum | active/past_due/canceled |

### allowance_period  *(the pooled pool for a billing period)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| office_id (or organization_id) | uuid fk | pool scope |
| period_start / period_end | date | |
| included_seconds | bigint | seats × 3h × 3600 |
| bundle_seconds | bigint | sum of active bundles |
| consumed_seconds | bigint | **incremented server-side** from session durations |

`remaining = included + bundle − consumed`. When `remaining <= 0`, **block new sessions** (no auto-overage). Surface a low-balance warning under ~20%.

### conversation_bundle  *(prepaid top-up)*
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| office_id (or organization_id) | uuid fk | |
| hours | int | 5 / 10 / 20 |
| stripe_payment_intent | text | |
| purchased_at | timestamptz | |

### leaderboard_entry  *(recomputed; materialized view or table)*
| column | type | notes |
|---|---|---|
| scope | enum | `office` \| `global` |
| office_id / organization_id | uuid | |
| subject_type | enum | `setter` (office scope) \| `office`/`group` (global scope) |
| subject_id | uuid | |
| service_type | text | scores aren't comparable across services |
| score | numeric | **fairness-weighted**: average and/or improvement, NOT raw volume |
| movement | int | rank delta since last recompute |
| period | text | |

**Privacy:** global scope exposes office/group standings only — never individual setter names across organizations.

---

## Derived / computed views the UI expects
- **Setter progress:** per-skill score over time (line), and a universal-skill profile (radar) across service types → query `skill_score` joined to `session.started_at`.
- **Office dashboard:** per-setter usage (sum `duration_seconds`), score trend, active recommendations; office allowance meter.
- **Group overview:** roll-up of offices (avg score, usage, rank), group pool, global standing.
- **Platform:** practice list with MRR/seats/status, agent catalog, training catalog with recommend counts.

See `API_SURFACE.md` for the endpoints that back each screen.
