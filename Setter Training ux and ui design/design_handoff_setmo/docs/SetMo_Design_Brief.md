# SetMo — Design Brief (for Claude Design)

**Product:** SetMo (a Grow Dental AI product)
**Companion to:** SetMo PRD v1.1 (product behavior lives there; this covers what to design and how it should look)
**Date:** June 7, 2026

---

## 1. How to use this brief

This tells Claude Design *what screens to design and the look and feel*. SetMo inherits the Grow Dental AI design system, so it should read as part of the family. When a behavior question comes up, the PRD is the source of truth.

---

## 2. Design principles

- **Family resemblance.** Match Grow Dental: dark theme, brand purple, bold metric-forward layouts.
- **Coach-like and motivating.** This is a tool that grades people — it must feel encouraging, not punishing. Celebrate improvement; frame misses as the path forward.
- **Metric-forward.** Scores and progress are the heart of the product. Use the gradient-number treatment for big figures, and clear, legible data viz.
- **Layered depth.** No flat surfaces or single-layer shadows; use the surface scale and purple-tinted glow to create hierarchy.
- **Clarity over decoration.** Strong hierarchy, generous spacing, one clear primary action per screen.
- **Accessible on dark.** Maintain contrast; visible focus states on every interactive element.

---

## 3. Brand tokens (reference)

- **Type:** Lato (Black) for headings (−0.03em tracking, line-height ~1.1); DM Sans for body.
- **Primary — purple:** `#8b5cf6` → `#7c3aed` (135° gradient); full 50–900 scale.
- **Surfaces (dark):** `#08080f` page → `#0d0d18` → `#121220` → `#1a1a2e` → `#24243a` (raised cards).
- **Achievement / progress / leaderboard — mint:** `#34d399` / `#10b981`.
- **Text:** `#e2e8f0` primary, `#94a3b8` muted; **error** `#ef4444`.
- **Radius:** 6 (tags) / 10 (inputs) / 12 (buttons) / 16 (cards) / 24 (CTA cards) / full (pills, dots).
- **Effects:** layered purple-glow shadows, gradient buttons, spring easing (`cubic-bezier(0.34,1.56,0.64,1)`), subtle noise texture, gradient-text for large numbers.
- **Layout:** 1280px max width, generous section spacing.

**Do:** purple as primary accent; layered glow shadows; Lato Black + DM Sans pairing; gradient text for stat numbers; full hover/focus/active states; spring micro-interactions.
**Don't:** default Tailwind blue/indigo; flat single-layer shadows; one font for everything; `transition-all`; random spacing; all surfaces on one z-plane.

**SetMo's signature within the system:** purple is the brand thread; **mint is the win color** — progress up, streaks, leaderboard movement, score improvements.

---

## 4. Information architecture (by role)

- **Setter:** Dashboard · Practice (start a session) · Progress · Trainings · Leaderboard
- **Office Admin:** Dashboard · Team · Service Catalog · Usage & Billing · Leaderboard
- **Group / DSO Admin:** Group Overview · Offices · Usage · Leaderboard standing
- **Platform Admin:** Practices · Agents · Training Catalog · Global Leaderboard

---

## 5. Screen inventory

Priority key: **P1** = design first (v1 foundation), **Later** = subsequent phases.

**Auth**
- Login **(P1)**
- Accept invite / set up account **(P1)**
- Forgot / reset password (Later)

**Setter**
- Dashboard / home **(P1)** — greeting, prominent "Start practice" CTA, recent sessions, current skill snapshot, allowance remaining, leaderboard peek.
- Start session / service picker **(P1)** — pick a service type (v1: implants only, but design the picker to scale to more), optional difficulty (or "adaptive"), start.
- **Live session screen (P1 — the signature screen; see §6)**
- Post-session results **(P1)** — the eight-skill scored breakdown (1–5, gradient numbers), narrative feedback, specific wins, specific misses, replacement phrases, recommended next scenario, and a CTA into the recommended training.
- Progress over time **(P1/P2)** — per-skill line charts; a universal-skill profile (radar or bars); filter by service type.
- Trainings & recommendations (P2) — recommended trainings with the "why" shown; catalog.
- Leaderboard (P2) — office ranking, with mint highlights for movement.

**Office Admin**
- Practice dashboard **(P1)** — team usage snapshot, allowance-pool meter, quick actions.
- Team / setters list **(P1)** — each setter's usage, score trend, current recommendations.
- Setter detail (P1/P2) — full score history, recommendations and reasons.
- Service catalog config **(P1)** — toggle services offered; practice details used in role-play (name, city, offer/voucher or deposit policy).
- Usage & billing **(P1)** — allowance-pool meter, buy-a-bundle flow, seat count, billing cadence (monthly/quarterly), invoices.
- Invite setters **(P1)**
- Office leaderboard (P2)

**Group / DSO Admin** (Later)
- Group overview, offices list, group usage, global-leaderboard standing.

**Platform Admin** (Later)
- Practices, agents, training catalog, global leaderboard.

---

## 6. The signature screen — live practice session

This is the screen that defines the product. Voice-forward and distraction-free.

- **Pre-call:** request mic permission; show minimal context (service type, maybe "you're calling a new lead") — **do not reveal** the hidden persona, difficulty, or the lead's "why"; that would defeat the training. Clear "Start call" action.
- **In-call:** a calm, focused state. A mint "live" pulse indicator (mirrors the Grow Dental status-pulse motif), a subtle voice/waveform visual, **elapsed time and time remaining against the allowance**, mute, and a prominent "End call & get feedback" action.
- **Wrap:** transition into the scored results (§5, post-session results). Celebrate with mint where the setter improved.

Time remaining is always visible so setters manage their pooled allowance; surface a low-balance state when the pool runs down.

---

## 7. Component inventory

- **Score card** — gradient number for the headline score and per-skill 1–5.
- **Skill breakdown** — eight bars or a radar, visually grouping universal vs service-specific skills.
- **Progress line chart** — per-skill over time (Recharts-friendly).
- **Universal skill profile** — radar or grouped bars across service types.
- **Leaderboard list/cards** — ranked rows, mint highlights for top spots and upward movement.
- **Allowance-pool meter** — hours used vs available, with a clear low-balance state.
- **Bundle purchase modal** — choose a time bundle, confirm via Stripe.
- **Recommendation card** — the recommended training plus the "why," with a CTA.
- **Setter card/row** — name, score trend sparkline, usage.
- **Live-call panel** — the in-session UI from §6.
- **Service picker cards.**
- **Empty, loading, and error states** throughout (dark-theme appropriate).

---

## 8. Key flows

1. **Office onboarding:** register → choose services offered → set practice details → invite setters → set seats & billing cadence → done.
2. **Setter's first session:** login → dashboard → Start practice → (service / difficulty) → grant mic → live call → End & get feedback → scored results → recommended training.
3. **Reviewing progress:** dashboard → Progress → per-skill trends and skill profile.
4. **Topping up usage:** dashboard → Usage & Billing → pool running low → buy a bundle → confirm (Stripe) → pool tops up.
5. **Admin reviews the team:** dashboard → Team → setter detail → scores, recommendations, usage.

---

## 9. Tone & UI voice

Motivating, plain-spoken, coach-like. Celebrate wins explicitly (and in mint). Frame misses as growth, never as failure. Avoid clinical jargon. CTAs should feel like encouragement to keep practicing ("Run a rep," "See how you did," "Try a tougher lead").

---

## 10. Responsive & accessibility

- Desktop-first for admin surfaces; the setter dashboard and live-session screen should also work well on a tablet or smaller screen.
- Maintain contrast on the dark palette; visible `focus-visible` states on all interactive elements.
- Spring easing for micro-interactions; honor reduced-motion preferences.

---

## 11. v1 design priorities

Design these first: Login, Accept invite, Setter dashboard, Start session / service picker, **Live session screen**, Post-session results, Office practice dashboard, Team list, Service catalog config, Usage & billing, Invite setters. v1's only live service type is implants/full-arch/dentures — but design the service picker and rubric views to scale to more service types.

---

## 12. Out of scope (v1 design)

Secret shopper, consultative coach mode, deep Group/DSO and Platform Admin tooling, and content for service types beyond implants.
