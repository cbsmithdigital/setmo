# SetMo — Product, Package & Charge Catalog
### Source-of-truth spec for Claude Code. Architecture & billing engineering is yours to design; this defines *what exists* and *what gets charged*.

**Hierarchy of units (for billing context):**
`Account` → one or more `Locations` (a location = a practice/office) → `Users` (some of which are billable seats).
- **Team** bills **per setter seat.**
- **Practice** bills **per location** (with included seats) + **per additional setter seat.**
- **Group / DSO** bills **custom**, per deal.

---

## 1. Packages (recurring subscriptions)

All plans are **quarterly or annual only — no month-to-month.** Prices below are the **monthly-equivalent rate**; the actual charge is that rate × 3 (quarterly) or × 12 then −~10% (annual). Founders rates are locked for the life of the plan (see §4).

### Team — *for single practices / individual setters*
| | Standard | Founders |
|---|---|---|
| Price | $199 / setter seat / mo | $129 / setter seat / mo |
| Billing unit | Per setter seat | Per setter seat |

**Includes, per seat:** AI practice calls (adaptive), full 8-point scoring with coaching + replacement phrases, progress tracking, recommendations, leaderboards, **5 hours of practice / seat / mo (pooled across the team)**, prepaid top-up bundles available.

### Better — Practice — *for practices that want the management layer*
| | Standard | Founders |
|---|---|---|
| Base price | $499 / location / mo | $349 / location / mo |
| Included in base | 1 office-manager seat + 2 setter seats | same |
| Additional setter | $149 / seat / mo | $99 / seat / mo |

**Includes:** everything in Team for the included seats, **plus** office-manager dashboard, **Setty Office Coach**, recommended trainings, and decision support.

### Best — Group / DSO — *for multi-location groups*
| | |
|---|---|
| Price | **Custom** (sales-led, per deal) |
| Founders | Locked discount + roadmap input |

**Includes:** everything in Practice, **plus** multi-location command center, outlier / top-performer detection, **Setty Advisor**, and playbook rollout across locations.

---

## 2. Users & seats

| Role | What they do / access | In which package | Billable seat? |
|---|---|---|---|
| **Setter** | Practices against the AI lead, gets scored, sees own progress + leaderboard | All (the core seat) | **Yes** — the per-seat unit |
| **Office Manager** | Manager dashboard, sees all setters' scores, uses Setty Office Coach, builds/assigns trainings | Practice (1 included), Group | Included in Practice base; not separately billed |
| **Group / DSO Admin** | Multi-location command center, Setty Advisor, cross-location view, playbook rollout | Group / DSO | Part of custom deal |
| **Account Owner / Billing Admin** | Owns the account, manages the subscription + payment, invites users | All | No (a permission, not a seat) |

Notes:
- A **setter seat** is the billable unit everywhere. Team = buy seats directly. Practice = 2 included, then $149/$99 each beyond. Group = negotiated.
- **Office Manager is its own seat type** (included in the Practice base, not a setter seat) and does **not** include setter-practice access by default. If a manager wants to practice, the practice can **grant them one of the 2 included setter seats** — which then consumes that setter seat. So a practicing manager = 1 manager seat + 1 of the included setter seats in use.

---

## 3. One-time charges & add-ons

### Setter Assessment
- **What it is:** 5 calls with the AI agent → we score them → a report is generated for the office/setter.
- **Free allowance:** **1 free assessment per practice** (the first one).
- **Price after the first:** **$50 each** (one-time).
- **Rule to enforce:** track `free_assessment_used` per practice; first = $0, every subsequent = $50.
- **Report contents (high level)** — *Claude Code wires the exact data, inputs, and calculations; this is the shape of the report the assessment produces:*
  - **Overall readiness score** — a composite 1–5 across the 5 calls.
  - **8-skill breakdown** — each scored 1–5 with a one-line reason: rapport, listening, discovery, pain-point exploration, objection handling, confidence, value building, closing.
  - **Per-call notes** — for each of the 5 calls: what landed, what missed, and the replacement phrase to use next time.
  - **Top leaks** — the 2–3 lowest skills that are costing booked consults.
  - **Estimated recovery** — projected upside if those leaks close: extra booked consults / month and an approximate $ value (driven by the practice's case value; exact formula is Claude Code's to define).
  - **Recommended next steps** — the specific trainings/drills to start with, tied to the weakest skills.
  - **Baseline stamp** — date + scores saved as the practice's baseline to measure future progress against.

### Prepaid conversation / top-up bundles
- **What it is:** extra practice hours when a team's pooled included hours run low. No surprise overage — the team buys more.
- **Type:** one-time charge.
- **Size & price:** *to confirm* (see §6). Placeholder: a 5-hour bundle at ~$99–119.

---

## 4. Pricing modifiers & money rules

| Rule | Definition |
|---|---|
| **Founders pricing** | Lower locked rates (see §1). Available to new customers **until August 1, 2026.** Once a customer subscribes at founders pricing, it stays locked for the life of their plan. |
| **Annual discount** | Paying annually saves **~10%** vs the quarterly rate. (Exact % to confirm — §6.) |
| **Commitment** | Minimum commitment is **one quarter.** Plans are quarterly or annual; no month-to-month. |
| **First-month win-back credit** | Customer earns **one month's cost back as a credit** if, in month one, they (a) reach **85% of included usage** AND (b) complete the **best-practices trainings within the first 3 weeks.** Conditions apply. This is a **credit**, not a charge. **Dependency:** the trainings half is blocked on the training module, which is still to be built — finalize it once trainings exist. The 85%-usage half can be defined now. |
| **90-day satisfaction guarantee** | If SetMo isn't sharpening the team's calls within 90 days, "we'll make it right." **Not an automatic charge/refund** — discretionary support resolution (credit, extension, or refund per policy). |

---

## 5. Master charge list — *everything that can hit a customer's bill*

| # | Charge | Type | Amount | Trigger / rule |
|---|---|---|---|---|
| 1 | Team subscription | Recurring (qtr/annual) | $199 std / $129 founders per setter seat / mo | Per active setter seat |
| 2 | Practice base | Recurring (qtr/annual) | $499 std / $349 founders per location / mo | Per location; includes mgr + 2 setters |
| 3 | Practice — additional setter | Recurring (qtr/annual) | $149 std / $99 founders per seat / mo | Each setter seat beyond the 2 included |
| 4 | Group / DSO subscription | Recurring (custom) | Custom | Per negotiated deal |
| 5 | Setter Assessment | One-time | $0 first, then $50 | First per practice free; each additional $50 |
| 6 | Top-up conversation bundle | One-time | TBD (~$99–119 / 5 hrs placeholder) | Bought when pooled hours run low |
| 7 | Annual discount | Discount | −~10% | Applied when billed annually |
| 8 | Founders pricing | Discount (locked rate) | Built into rows 1–4 | New customers before Aug 1, 2026 |
| 9 | First-month win-back | **Credit** | +1 month's cost | Met 85% usage + trainings in 3 weeks |
| 10 | 90-day guarantee | **Credit/refund (manual)** | Varies | Discretionary, per policy |

---

## 6. Decisions & remaining dependencies
1. **Top-up bundle** — placeholder stands for now (5 hrs / ~$99–119). ✅ ok for now
2. **Annual discount** — ~10% stands for now. ✅ ok for now
3. **Win-back trainings condition** — ⏳ **depends on the training module, which still has to be built.** The 85%-usage condition can be built now; finalize the trainings condition once the training side exists.
4. **Practice included setters** — ✅ 2 included.
5. **Group / DSO** — ✅ fully custom / sales-led; no published starting price.
6. **Office Manager seat** — ✅ separate seat type; does not include practice access by default, but the practice can grant the manager one of the 2 included setter seats (which consumes that seat). See §2.
