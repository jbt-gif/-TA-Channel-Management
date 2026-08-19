# Enterprise Plan Audit Report

**Plan:** `.paul/phases/02-front-desk-booking-core/02-06-PLAN.md`
**Audited:** 2026-08-18
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Not acceptable as originally drafted — one release-blocking gap with a concrete, high-likelihood failure scenario (the single most common interaction path — accept the default, submit — would fail every time under a realistic precondition). Conditionally acceptable as amended. This plan is otherwise the most mature draft of the frontend series so far: it correctly reused 02-05's established patterns (staleness guard, currency formatting, backend-as-authority) rather than reinventing them, and correctly reasoned through the one place a naive implementation could have reopened a security concern (verbatim backend error messages) without actually creating a new gap.

## 2. What Is Solid

- **Correctly distinguishes "safe to show verbatim" from "must stay generic."** The plan explicitly reasons that 02-03's booking-error messages (sold-out, duplicate, pricing-unavailable) are safe to display as-is — unlike 02-04's login-error case — because they're operational feedback to an authenticated staff member about their own hotel's data, not a cross-tenant-enumeration surface. This is the correct application of the same principle 02-04's audit established, not a blind copy-paste of "always show generic errors."
- **Correctly refuses to duplicate business-rule validation client-side** (quantity caps, availability re-checking) — defers to the backend's atomic re-check, explicitly naming *why* (the displayed number can itself be stale by submission time) rather than just asserting a rule.
- **Reuses 02-05's staleness-guard and currency-formatting patterns explicitly by reference**, rather than re-deriving parallel implementations that could drift from each other over time.

## 3. Enterprise Gaps Identified

1. **Default check-in date can silently be a past date.** The original plan defaulted the check-in field straight to the Dashboard's current `startDate`. 02-05's Prev-week navigation has no lower bound (nothing stops staff from paging backward to review historical availability). If a staff member does that and then opens the booking form without noticing, the default check-in date is in the past — and the backend correctly rejects it with 400. This isn't a rare edge case: it's the single most common interaction (accept the default, don't touch the date field, submit) failing under a plausible, easy-to-trigger precondition, with no indication to the user why.
2. **State-mismatch race between form submission and Dashboard's own selection state.** Nothing in the original plan prevented a staff member from switching room type or week while a booking submission was in flight. On success, `onBookingSuccess()` would refresh whatever is *currently* selected — which, after a mid-flight switch, is not the room type/week the booking actually affected. The actually-booked room type's grid would silently show stale availability until manually revisited.
3. **No handling for a room type with zero rate plans.** The rate-plan `<select>` was assumed to always have options. A room type without any configured rate plans (plausible once Phase 3 adds self-service configuration) would render an empty, unusable dropdown with no explanation, inviting a submit-and-fail attempt rather than a clear "not bookable yet" message.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Default check-in date can be a past date | Task 2 `<action>` | Default changed to `max(todayManilaStr(), Dashboard's current startDate)`, with explicit rationale tied to 02-05's unbounded Prev-week navigation |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Room-type/week switch mid-submission causes a stale-grid mismatch | Task 2 `<action>` | Added explicit requirement to disable the selector and week-nav buttons while a submission is in flight |
| 2 | No handling for zero rate plans | Task 2 `<action>` | Added explicit "no rate plans configured" fallback state, replacing a silently-broken empty dropdown |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 1 | Rate-plan dropdown doesn't show price (roomTypes list has no price field) | UX nicety — staff can already see per-rate-plan prices in the calendar grid directly above the form before opening it |
| 2 | Checkout date doesn't auto-adjust when check-in is edited past it | UX polish — the backend's clear validation message already satisfies AC-2's correctness requirement; auto-adjustment is a convenience, not a correctness gap |

## 5. Audit & Compliance Readiness

- **Silent failures:** All three findings were silent-failure or silent-staleness risks — none produced a crash, but all could leave a staff member confused or acting on stale information without any error being shown. Closed by this amendment.
- **This is the last plan of Phase 2.** Closing it cleanly means Phase 2's own stated goal (ROADMAP.md: "staff can view the calendar grid and create a walk-in booking that atomically, safely decrements inventory") becomes literally, fully true — not just true at the API layer, which is what the pre-frontend state of the project actually delivered.

## 6. Final Release Bar

**What must be true before this plan ships (APPLY):**
- The Manila-clamped default check-in date is implemented and actually tested against a backward-navigated week during the checkpoint, not assumed.
- The in-flight-disable behavior on the selector/week-nav is implemented and doesn't regress AC-4's submit-button-disable requirement (both should hold simultaneously).
- security-review runs against the diff before UNIFY closes, per SPECIAL-FLOWS.md's guest-PII trigger — this plan's own `<skills>` section already commits to this correctly.

**What risks remain if shipped exactly as amended:**
- None identified beyond the two deferred UX items, both low-impact.

**Sign-off:** I would sign this plan as amended. It's the tightest first draft of the three frontend plans this session — the audit's job here was narrower and found less because the plan already applied the lessons from 02-04 and 02-05's audits (verbatim-vs-generic error messages, staleness guards, backend-as-authority) rather than needing to relearn them.

---

**Summary:** Applied 1 must-have + 2 strongly-recommended upgrades. Deferred 2 items.
**Plan status:** Updated and ready for APPLY.

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
