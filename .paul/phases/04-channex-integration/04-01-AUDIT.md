# Enterprise Plan Audit Report

**Plan:** .paul/phases/04-channex-integration/04-01-PLAN.md
**Audited:** 2026-08-18
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Not enterprise-ready as originally written — not because the architecture is wrong, but because it has three gaps at exactly the highest-risk points: a duplicate-record race under Channex's own documented retry behavior, an underspecified state transition (booking modification with a date/room change) that could leave data in an ambiguous state, and an implementation detail (webhook secret header name) left as an example rather than pinned, which would guarantee an integration failure discoverable only at the live checkpoint. I would not sign off on this as originally written. With the must-have fixes applied (now done), this is a defensible, buildable plan.

## 2. What Is Solid

- **Reusing 02-03's proven conditional-UPDATE transaction pattern** for both the increment (booking_new) and decrement (cancellation) paths — this is the correct move; that pattern is already proven live under concurrent load (50 requests, exactly 1 succeeds), and re-deriving a new locking strategy for OTA-sourced bookings would have been unjustified risk.
- **Constant-time secret comparison** (`crypto.timingSafeEqual`) — correctly identifies and avoids the same class of timing side-channel 02-01's audit caught and fixed for password comparison. Shows the pattern generalized correctly to a new context.
- **Idempotency keyed on `Booking.externalBookingId`** — this field and the `BookingSource.OTA` enum value were literally pre-built in Phase 1 anticipating this exact use, per the field's own doc comment. Good continuity of design intent across phases.
- **Fail-closed secret verification before any DB read/write** — correct ordering, prevents an unauthenticated request from touching data even incidentally.
- **ChannelMapping-based resolution of Channex's room/rate IDs, not trusting them directly** — respects the project's tenant-isolation discipline; an unmapped external ID fails loudly (AC-7) rather than silently guessing or trusting cross-tenant data.
- **Correctly distinguishes "genuine failure → let Channex retry" from "logical no-op → 200"** — this required actually internalizing RESEARCH.md's finding that Channex's retry mechanism can't fix an inventory conflict, and applying that correctly rather than defaulting to "retry on everything."

## 3. Enterprise Gaps Identified

1. **TOCTOU race in the idempotency check.** The original Task 2 flow checked for an existing Booking via `findFirst`, then later created one — with no atomic guarantee between the two. Under Channex's own documented behavior (retries fire on any 5xx, with no guarantee the receiving server has finished the prior attempt), two concurrent deliveries of the same event could both pass the check and both proceed to create a Booking. The DailyInventory conditional-UPDATE would still prevent double-decrementing physical inventory, but nothing prevented two Booking rows for the same `externalBookingId` — a real duplicate-record risk, the exact class of bug that turns into a double-booked guest showing up at the desk.

2. **`booking_modification`'s date/room-change path was a one-sentence gesture** ("treat it as cancel-old + create-new") with no atomicity guarantee, no rollback story if the new dates are sold out, and no answer for what happens to the original booking if the operation fails partway. This is the plan's single highest-complexity state transition and it was the least specified part of the plan — exactly backwards for a system that needs to survive real-world edge cases without a human watching.

3. **The webhook secret header name was left as `e.g. x-channex-webhook-secret`** — an example, not a decision. This header name is independently configured in two places (the code, and Channex's dashboard during the live checkpoint) that must match exactly. Leaving it as "e.g." invites the two to diverge, which would silently fail at the worst possible time to debug it — mid-checkpoint, against a live third-party service.

4. Malformed/incomplete data from Channex's own API was not defended against — the plan assumed `pullBookingRevision`'s success response is always well-formed, with no validation step before using it to build a financial/booking transaction.

5. `createdByUserId` for a webhook-created Booking was left implicit — for an audit-defensible system, "who or what created this record" must be a deliberate, documented choice (even when the answer is "no human, system-created"), not an unstated null.

6. No request-size protection specifically on this new internet-facing, lighter-auth endpoint. The project's existing Deferred Issues list already accepts no-rate-limiting project-wide as lower priority, but a webhook endpoint specifically reachable pre-secret-check by an oversized body is a cheap, worthwhile defense-in-depth addition, not a redesign.

7. No structured log shape was defined — "log clearly" was repeated three times in the plan without ever being defined, which means real incident reconstruction later would depend on guessing what got logged at build time.

8. The verify step tested the happy/idempotent/conflict paths but not the negative case of AC-8 — that a genuine internal error actually surfaces as 500, not silently swallowed by an overly broad catch block into a 200.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | TOCTOU race on idempotency check | Task 1 (schema), Task 2 (action, step 7), new AC-9, Task 2 verify | Added a partial unique DB index on `Booking(hotelId, externalBookingId)` as the real backstop; handler now catches the resulting Prisma P2002 violation and treats it as the idempotent no-op case; added a concurrent-duplicate-request test to the verify step |
| 2 | Underspecified booking_modification date-change path | Task 2 (action, step 9), new AC-10 | Specified the exact atomic sequence (release old inventory + cancel old booking + attempt new booking, all in one `$transaction`; full rollback on failure, original booking survives untouched; explicit note that the replacement booking needs its own distinguishable identifier since the unique index now prevents reusing the same `externalBookingId` twice) |
| 3 | Webhook secret header name left as an example | Task 1 (action) | Pinned the exact header name (`x-channex-webhook-secret`) in the code spec, with an explicit note that Task 3's live checkpoint must configure the identical literal name on Channex's side |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 4 | No validation of pulled Channex revision data | Task 2 (action, step 5) | Added explicit validation requirement: non-empty `rooms[]`, required fields present per room, three falsy shapes of `customer.mail` (missing/null/empty-string) treated uniformly, fail with a typed error rather than a downstream crash |
| 5 | `createdByUserId` left implicit for webhook-created bookings | Task 2 (action, step 7) | Specified explicit `createdByUserId: null` with a required code comment explaining why (no human initiated this booking) |
| 6 | No size protection on this internet-facing endpoint | Task 2 (action) | Added a route-scoped `express.json({ limit: '256kb' })`, explicitly not touching the global `app.ts` default |
| 7 | AC-8's negative case (genuine error → 500) untested | Task 2 (verify) | Added an explicit test: point `CHANNEX_BASE_URL` at an invalid host temporarily, confirm 500 (not silently-swallowed 200) |
| 10 | No structured log shape defined | Task 2 (action) | Defined a minimum required shape for every log line this handler emits: `{ hotelId, event, revisionId, outcome }` |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 8 | Full concurrent-multi-event-ordering correctness (e.g. modification and cancellation for the same revision arriving out of order) | RESEARCH.md documents Channex doesn't guarantee delivery order at all; solving every possible interleaving is genuine v2 hardening work once real webhook volume exists to justify it, not a blocker for a first working integration against a low-volume pilot hotel. Logged to STATE.md Deferred Issues. |
| 9 | Structured metrics/observability dashboard for webhook success/failure rates | Explicitly 04-03's scope ("sync status UI"), not this plan's — correctly out of boundary already, just noting it's a known gap this plan intentionally doesn't fill. |

## 5. Audit & Compliance Readiness

With the must-have fixes applied: the unique-index backstop gives real, DB-enforced audit-defensible deduplication rather than app-logic hope, matching this project's own established pattern (the DailyInventory CHECK constraint from Phase 1, the downpayment-percent CHECK constraint from 03-01). `Booking.externalBookingId` + `source: OTA` + the now-explicit `createdByUserId: null` gives clear, complete provenance for every OTA-created record — a reviewer can answer "who or what created this and why" for any row. The structured log shape requirement means an incident (a guest showing up to find their OTA booking missing) can actually be reconstructed from logs rather than guessed at. The one area that would still draw a real auditor's attention: the deferred multi-event-ordering edge case (finding 8) — acceptable to ship without at this pre-revenue, low-volume stage, but should be revisited before this system handles meaningful booking volume, and is already flagged for exactly that in Deferred Issues.

## 6. Final Release Bar

**Must be true before this ships:** the three must-have fixes (unique-index-backed idempotency, atomic modification-path handling, pinned header name) — all now applied to the plan. **Remaining risk if shipped as amended:** the deferred multi-event-ordering edge case (acceptable at current scale, flagged for revisit); and the malformed-data-validation and logging fixes (strongly-recommended, applied) still depend on correct implementation at APPLY time, same as any plan — the plan being correct doesn't guarantee the code will be, which is exactly what the security-review + gsd-security-auditor passes required by SPECIAL-FLOWS.md for this specific phase exist to catch. I would sign off on this plan as amended, contingent on those two passes clearing after APPLY.

---

**Summary:** Applied 3 must-have + 5 strongly-recommended upgrades. Deferred 2 items.
**Plan status:** Updated and ready for APPLY.

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
