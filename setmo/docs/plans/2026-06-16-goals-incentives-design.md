# Goals & Incentives — Design

_Status: approved 2026-06-16. Build target: everything except the real gift-card vendor (a provider-agnostic boundary + manual mode ships now)._

## Purpose
Let offices set goals for their setters, and groups/DSOs set goals for practices and setters, tied to SetMo's existing analytics. When a goal is achieved, the creating office/group can send the user a gift card or incentive. Achievement is auto-detected; the admin approves the payout. The actual vendor send is abstracted so any provider can be dropped in later.

## Decisions (from brainstorming)
- **Payout flow:** auto-detect achievement → admin **approves & sends**.
- **Goal metrics:** skill scores, booking outcomes, activity/consistency, ranking/personal best.
- **Group reach:** group can target **practices and individual setters** directly.
- **Targets:** individual **and** team/practice goals.
- **Team payout:** every qualifying contributor gets their own reward (optionally including the manager).
- **Reward shape:** fixed amount per goal (gift card $ or custom incentive label).
- **Funding:** whoever creates the goal funds it.

## Data model (2 models + enums)

**Goal** — definition + (for team goals) the aggregate result.
- `creatorScope` OFFICE|GROUP · `officeId?` · `organizationId?` · `createdById`
- `title` · `description?`
- `targetType` SETTER|TEAM
- `metric` OVERALL_SCORE | SKILL_SCORE | SET_RATE | SHOW_RATE | CONSULTS | CASES | PRODUCTION | REPS | PRACTICE_HOURS | STREAK_WEEKS | LEADERBOARD_RANK | PERSONAL_BEST | MANUAL
- `skillKey?` (SKILL_SCORE) · `comparator` REACH|IMPROVE_BY|MAINTAIN|RANK_TOP · `targetValue`
- `window` THIS_MONTH|LAST_30D|CUSTOM|ONGOING · `startDate?`/`endDate?`
- `recurrence` NONE|MONTHLY · `seriesId?` · `periodKey?`
- `minQualifyingReps` (anti-gaming; score/outcome goals; real calls ≥60s only)
- `rewardType` GIFT_CARD|CUSTOM · `rewardAmountCents?` · `rewardLabel?`
- `funderScope` OFFICE|GROUP · (funder office/org via creator)
- `includeManager` Boolean (team goals)
- `status` DRAFT|ACTIVE|COMPLETED|ARCHIVED
- `teamValue?` · `teamAchieved?` · `achievedAt?`

**GoalParticipant** — per-person progress + reward/payout (unique goalId+setterId).
- `baselineValue?` (IMPROVE_BY) · `currentValue` · `progressPct` · `qualified`
- `achieved` · `achievedAt?`
- `rewardStatus` NONE|PENDING|APPROVED|SENT|FAILED|DECLINED · `rewardAmountCents?` · `approvedById?` · `sentAt?` · `providerRef?`

## Evaluation engine
`evaluateGoal(goal)` reads existing analytics per subject+window, applies the comparator, updates participants (and team aggregate). Sources: `getSetterAnalytics`, `skillAveragesOverSessions`, `practiceSignal` (extended per-setter), `OfficeOutcome`, session counts/durations, `LeaderboardEntry`. Comparators: REACH (≥), IMPROVE_BY (Δ vs baseline), MAINTAIN (window avg ≥, with min reps), RANK_TOP (≤). Only real scored calls count; `minQualifyingReps` gates score/outcome goals. `progressPct` clamped 0–100.

**Triggers:** (1) after `scoreSession()` — evaluate that setter's + their office's active goals; (2) daily cron `/api/cron/goals` — sweep all ACTIVE goals (outcomes, streaks, expiry, monthly rollover); (3) on goals-page load — recompute that scope. Achievement frozen by `achievedAt`; reward sends idempotent on `participantId`.

## Lifecycle & approval
Goal: DRAFT → ACTIVE (baselines + participant rows created) → COMPLETED (window ends / rewards resolved) → ARCHIVED.
Reward: tracking → achieved → PENDING → admin Approve&send → APPROVED → provider → SENT (+providerRef) | FAILED (retry) | DECLINED. Manual mode = "Mark as sent."
Monthly recurrence via `seriesId`+`periodKey`: rollover completes the current instance and spawns a fresh one.

## Incentive boundary (vendor-agnostic)
`src/lib/incentives.ts`: `IncentiveProvider.send({toEmail,toName,amountCents,label,idempotencyKey}) → {status,providerRef?,error?}`. `getIncentiveProvider()` keyed by env `INCENTIVE_PROVIDER` (default `manual`). **ManualProvider** records intent + marks SENT so the flow works today. Future adapters (Tremendous/Tango/Rybbon/…) implement the same interface — no goal-logic changes; redemption webhooks can update status later.

## Surfaces
- **Office** `/office/goals`: create form (target → metric/target/window → reward) with live preview; active list w/ progress; approval queue (Approve&send / Mark sent / Decline); history.
- **Group** `/group/goals`: same, target picker spans all locations (practice team or any setter); portfolio visibility.
- **Setter** `/goals` + dashboard card: active goals, reward at stake, achieved/celebration + reward status. Setty insight + weekly digest reference goals.
- Routes: `POST /api/goals`, `PATCH /api/goals/[id]`, `POST /api/goals/[id]/evaluate`, `POST /api/goals/participant/[id]/reward`, `GET /api/cron/goals` — role/scope access-checked.

## Out of scope (v1)
Real vendor integration (boundary + manual only) · tiered rewards / points catalog · budget caps / multi-approver · provider redemption webhooks · tax/1099 (flag to clients that high-value incentives may carry tax implications).
