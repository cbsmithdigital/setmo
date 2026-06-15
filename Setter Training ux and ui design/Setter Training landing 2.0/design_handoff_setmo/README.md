# Handoff: SetMo — design reference + backend build kit

**SetMo** ("set more appointments") is a web app where dental appointment setters practice high-value lead calls against a realistic AI patient, get objectively scored on an 8-point rubric, receive coaching, and track improvement — with team and cross-practice leaderboards. It's a Grow Dental AI product. This bundle hands a developer (or Claude Code) everything needed to **stand up the backend and wire it to the designed UI**.

---

## What's in this bundle

```
design_handoff_setmo/
├── README.md                ← you are here (start here)
├── PRODUCT_UPDATES.md       ← ⚠ read 2nd — newer pricing/packaging/Setty/Audit; overrides the PRD where they conflict
├── DATA_MODEL.md            ← Postgres schema: tables, columns, relationships, rules
├── API_SURFACE.md           ← endpoints grouped by area, tagged to screens + jobs
├── docs/
│   ├── SetMo_PRD.md         ← product requirements (source of truth for behavior)
│   └── SetMo_Design_Brief.md← look & feel, IA, screen inventory
└── prototype/               ← the working design reference (HTML/React)
    ├── SetMo App.html       ← the full app: 4 role workspaces, clickable
    ├── SetMo Marketing.html ← the marketing landing page
    ├── app/                 ← prototype source (see "Reading the prototype")
    └── assets/setmo-icon.png← brand icon (transparent)
```

## How to use this with Claude Code

1. Read `docs/SetMo_PRD.md` first — it's the **behavioral source of truth** (roles, flows, scope, tech stack, constraints).
2. **Then read `PRODUCT_UPDATES.md`** — pricing/packaging (3 tiers), the Setty coach, the Setter Audit, and the included-hours number (5, not 3) changed after the PRD. **It overrides the PRD where they conflict.**
3. Use `DATA_MODEL.md` to generate migrations/schema, and `API_SURFACE.md` to scaffold route handlers + background jobs.
4. Open `prototype/SetMo App.html` in a browser to see exactly what each screen looks like and how it behaves. Use the **workspace switcher** (bottom-left) to move between Setter / Office / Group / Platform views.
5. Build the backend against the schema + endpoints, then wire the real UI (see "About the design files").

> The fastest path: implement the schema, the **session bootstrap → ElevenLabs → post-call webhook → score ingestion** loop, and auth/roles first. That's the spine; everything else (progress, leaderboards, billing, coach, admin roll-ups) reads off it.

---

## About the design files

The files in `prototype/` are **design references created in HTML/React** — they show the intended look, layout, copy, and interactions. They are **not** the production app and should **not** be shipped as-is. The task is to **recreate these designs in the target codebase's environment** using its established patterns/libraries. The PRD names the intended stack:

**Next.js on Vercel** (web + API) · **Neon** Postgres · **Supabase** auth + storage · **Trigger.dev** background jobs · **Resend** email · **Stripe** billing · **ElevenLabs** conversational voice (web SDK + server-side bootstrap & score capture) · **Railway** for any long-running worker.

If you build the frontend in React/Next, you can lift structure and styling directly from the prototype (it's plain React + CSS variables). The prototype's mock data file (`prototype/app/data.js`) is effectively a **shape/seed reference** for the API responses — match its fields and you'll match the UI.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, and interactions are all defined. Recreate the UI faithfully. All design tokens are in `prototype/app/app.css` (dark app) and inline in `prototype/SetMo Marketing.html` (light marketing). Key tokens summarized below.

---

## The product in one diagram (the core loop)

```
Setter logs in ──▶ Dashboard ──▶ Start practice (pick service + difficulty)
   ──▶ Live session: browser voice call w/ ElevenLabs agent
        (server bootstrapped w/ office details + setter memory; persona hidden)
   ──▶ "End call & get feedback"
        ──▶ ElevenLabs POST-CALL WEBHOOK (server) writes transcript + duration + 8-skill score
   ──▶ Results screen reads the ingested evaluation
   ──▶ background jobs: recommendations (w/ reason), leaderboard, memory
```

The two non-negotiables: **scores & durations are captured server-side only**, and **usage draws down a pooled allowance** (seats × 3h) with **no auto-overage**.

---

## Roles & workspaces (what to build, by audience)

The prototype contains all four as switchable workspaces. Each is a route group / layout in production, gated by `user.role`.

| Workspace | Role | Screens (in prototype) |
|---|---|---|
| **Setter** | `setter` | Login · Accept-invite · Dashboard · Service picker · **Live session** · Results · Progress · Trainings (drip videos + workbooks) · **Coach** (chat + voice role-play) · Leaderboard |
| **Office Admin** | `office_admin` | Overview · Team · Setter detail · Service catalog config · Usage & billing (Stripe bundle + Resend invite) · Leaderboard |
| **Group / DSO** | `group_admin` | Group overview · Offices · Group usage · Global standing |
| **Platform** | `platform_admin` | Practices · Agents · Training catalog · Global leaderboard |

Full per-screen purpose/layout is in `docs/SetMo_Design_Brief.md` §5–6 and visible in the prototype. The **signature screen** is the live session (Design Brief §6) — voice-first, distraction-free, mint live-pulse, elapsed + remaining time against the pool, mute, and "End call & get feedback."

---

## Reading the prototype source

`prototype/app/` is plain React (loaded via Babel in the browser — no build step):

| File | Contains |
|---|---|
| `data.js` | **All mock data** — the shape/seed reference for API responses (users, skills, sessions, evaluation, team, billing, offices, agents, catalog, invite). |
| `app.css` | The dark design system (CSS variables = design tokens). |
| `ui.jsx` | Shared widgets: icons, sparkline, score Ring, allowance meter, the role-switching Sidebar. |
| `screens-core.jsx` | Login, Dashboard, Service picker. |
| `screens-session.jsx` | Live session (pre-call/in-call/wrap) + Results (8-skill rubric). |
| `screens-progress.jsx` | Progress (line chart + radar) + Leaderboard. |
| `screens-training.jsx` | Trainings hub + video modal. |
| `screens-coach.jsx` | Coach chat (LLM-backed) + voice role-play. |
| `screens-admin.jsx` | Office admin + bundle/invite modals. |
| `screens-group.jsx` | Group/DSO + Accept-invite. |
| `screens-platform.jsx` | Platform admin. |
| `app.jsx` | Router (screen id → component) + which screens are full-bleed. |

---

## Design tokens (high-fidelity)

**Type:** Lato (Black/900) for headings — letter-spacing −0.03em, line-height ~1.1; **DM Sans** for body. Gradient-text treatment on large score numbers.

**Color — dark app** (`prototype/app/app.css`):
- Surfaces: `#08080f` page · `#0d0d18` · `#121220` · `#1a1a2e` · `#24243a` (raised)
- Primary purple: `#8b5cf6 → #7c3aed` (135° gradient); lighter `#a78bfa`
- **Mint = the "win" color**: `#34d399 → #10b981` (progress, streaks, leaderboard movement, score improvements)
- Text: `#e2e8f0` primary · `#94a3b8` muted · error `#ef4444` · amber `#fbbf24`
- Radius scale: 6 (tags) / 10 (inputs) / 12 (buttons) / 16 (cards) / 24 (CTA) / full (pills)
- Spring easing for micro-interactions: `cubic-bezier(.34,1.56,.64,1)`; honor `prefers-reduced-motion`

**Color — marketing** (light, inline in `SetMo Marketing.html`): warm cream `#f6f3ec` / white surfaces, ink `#15131f`, same purple + mint accents. The dark app UI is used as the hero imagery.

## Brand assets
- `prototype/assets/setmo-icon.png` — the SetMo calendar/check icon (transparent PNG). Wordmark is set in Lato Black with "Set" in ink/white and "Mo" in mint. Replace with official SVG assets if/when available. (Logo provided by the client.)

---

## Scope reminder (from the PRD)
- **v1 ships the implant/full-arch/denture agent only.** Design the service picker + rubric views to scale, but only one agent is live.
- **No PHI/HIPAA** — personas are fictional; store employee-performance + practice-business data only.
- **Web-only** training in v1 (no phone dialing).
- Phases: 1 Foundation (auth/roles, sessions, server-side scoring, Stripe billing + metering) → 2 Coaching (recommendations + reasons, progress, memory) → 3 Office control → 4 Competition (leaderboards). See PRD §8.

For anything ambiguous, **the PRD wins** over the prototype.
