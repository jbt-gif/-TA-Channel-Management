---
phase: 02-front-desk-booking-core
plan: 03
subsystem: api
tags: [express, prisma, transaction, concurrency, multi-tenant, booking]

requires:
  - phase: 02-front-desk-booking-core (02-01)
    provides: requireAuth middleware, req.auth = {userId, hotelId, role}
  - phase: 02-front-desk-booking-core (02-02)
    provides: req.auth.hotelId-only tenant-scoping pattern, byte-identical-404 pattern this plan is the second write-path application of
  - phase: 01-data-model-foundation
    provides: DailyInventory CHECK constraint (the backstop this plan's transaction is designed to never actually trigger), Booking/BookingItem/Guest financial-audit-correct schema
provides:
  - POST /api/bookings — atomic, overbooking-safe walk-in booking creation
  - Proven concurrency-safe conditional-UPDATE transaction pattern, reusable by Phase 4's Channex booking_new webhook handler
  - Two new smoke tests (functional + concurrency) joining the project's existing regression suite
affects: [02-04-frontend-ui, phase-04-channex-integration]

tech-stack:
  added: []
  patterns:
    - "Conditional atomic UPDATE via Prisma tagged-template $executeRaw (auto-parameterized), one per date, inside a single interactive transaction — the check and the increment are the same statement, so concurrent requests serialize on Postgres's native row lock instead of racing"
    - "Any date's failed conditional UPDATE throws inside the transaction, triggering automatic rollback of every increment already applied earlier in that same attempt — the mechanism behind all-or-nothing multi-night bookings"
    - "Money arithmetic uses Prisma's Decimal (decimal.js) throughout — never native JS number — for any value that becomes a stored financial total"
    - "Every client-supplied field used in a Prisma `where` filter must be explicitly type-checked (typeof === \"string\"), not just truthy-checked — an unchecked field is a live filter-operator-injection vector, not just a data-quality gap"

key-files:
  created:
    - src/routes/bookings.ts
    - src/scripts/smoke-test-booking-flow.ts
    - src/scripts/smoke-test-booking-concurrency.ts
  modified:
    - src/app.ts
    - package.json
    - .paul/phases/02-front-desk-booking-core/SECURITY.md

key-decisions:
  - "Conditional UPDATE (not SELECT FOR UPDATE) chosen as the locking strategy — decided explicitly during PLAN authoring rather than deferred to an APPLY-time checkpoint, logged in STATE.md and Carl (paul-019)"
  - "Booking status set directly to CONFIRMED on creation (not the schema default PENDING_PAYMENT) — no online payment flow exists until Phase 5; documented as Assumption 1, not silently decided"
  - "No Payment record created in this plan — totalAmount is computed and stored, but nothing yet tracks whether/how a walk-in guest paid; documented as Assumption 2, explicitly flagged for user review rather than silently deferred"
  - "Guest matching is exact-email-only, never fuzzy — occasional duplicate Guest rows are an acceptable, mergeable-later tradeoff against the risk of merging two different people (Assumption 3)"
  - "minStay and multi-room-type-per-booking are explicitly out of scope, documented in <boundaries> rather than left as silent gaps"

duration: "~1 session"
started: "2026-08-18"
completed: "2026-08-18"
---

# Phase 2 Plan 03: Atomic Overbooking-Safe Booking Transaction Summary

**The core overbooking-prevention mechanism the whole project exists to guarantee — proven live under real concurrent load (50 simultaneous requests for the last room, exactly 1 succeeds), not just designed and reasoned about.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1 session |
| Started | 2026-08-18 |
| Completed | 2026-08-18 |
| Tasks | 3 completed (booking endpoint, functional smoke test, concurrency smoke test) |
| Files modified | 3 created, 3 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Staff can create a valid walk-in booking | Pass | totalAmount verified against manually-summed real per-night rates, not a flat-rate approximation |
| AC-2: Booking creation is hotel-scoped | Pass | Byte-identical 404 confirmed for cross-tenant, nonexistent, and the previously-untested ratePlan-belongs-to-wrong-roomType case (caught during gsd-security-auditor's live pass) |
| AC-3: Concurrent requests cannot oversell the last room | Pass | Live 50-request race: exactly 1 succeeded, 49 rejected cleanly (409), DB CHECK constraint held throughout |
| AC-4: Multi-night bookings are all-or-nothing | Pass | Sold-out middle date correctly rolled back the earlier night's increment |
| AC-5: Invalid input rejected before any DB mutation | Pass | Missing fields, bad dates, max-30-night cap all verified |
| AC-6: Endpoint requires authentication | Pass | 401 for no-token |
| AC-7 (audit-added): Only front-desk-capable roles can create bookings | Pass | HOUSEKEEPING role returns 403; gsd-security-auditor further proved it never reaches a DB call at all |
| AC-8 (audit-added): Rapid duplicate submission does not create two bookings | Pass | Second identical submission within 30s returns 409; exactly one Booking row confirmed |
| AC-9 (audit-added): Missing pricing data is a hard stop | Pass | Date range with a gap in RatePlanDailyRate returns 409, no partial-data booking created |

## Accomplishments

- The project's actual overbooking-prevention promise (PROJECT.md's Core Value) is now proven, not just modeled — a real HTTP race against a real Postgres database, not a reasoned-about design.
- Enterprise audit caught and closed 5 release-blocking gaps in the original plan draft before any code was written: an unspecified-raw-SQL SQL-injection footgun, a complete absence of authorization (any role including HOUSEKEEPING could create bookings), a silent-undercharge risk on missing pricing data, unspecified money-arithmetic precision, and an unbounded transaction size.
- `security-review` caught a real HIGH-severity gap that neither the enterprise audit nor my own implementation review caught: `guest.email` was truthy-checked but not type-checked before use in two Prisma `where` filters, letting a filter-operator object (`{"not": null}`) match an arbitrary existing Guest instead of the intended exact-match lookup. Fixed immediately, with a dedicated regression test added.
- `gsd-security-auditor` independently re-probed that fix live with 9 different attack-shape variants (not just re-running the existing test), proved the HOUSEKEEPING role gate genuinely prevents any DB call (not just a 403 response), and found + closed the one gap left untested (the ratePlan-belongs-to-wrong-roomType byte-identical-404 case) — 14/14 mitigations verified live.
- Zero regressions across all 4 pre-existing smoke tests (auth, calendar, inventory, booking-schema) after this plan's changes.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/routes/bookings.ts` | Created | POST /api/bookings — role gate, ownership check, pricing-availability guard, atomic conditional-UPDATE transaction, duplicate guard, Guest find-or-create |
| `src/scripts/smoke-test-booking-flow.ts` | Created | Functional smoke test — AC-1,2,4,5,6,7,8,9 plus the guest.email-injection regression test, live against a real HTTP server |
| `src/scripts/smoke-test-booking-concurrency.ts` | Created | AC-3's live proof — 50 concurrent requests for 1 room |
| `src/app.ts` | Modified | Mounted `bookingsRouter` at `/api/bookings` |
| `package.json` | Modified | Added `smoke-test-booking-flow` and `smoke-test-booking-concurrency` scripts |
| `.paul/phases/02-front-desk-booking-core/SECURITY.md` | Modified | Appended 02-03's 14-threat verification section |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Conditional UPDATE over SELECT FOR UPDATE | Leans on Postgres's native row-level locking during UPDATE; avoids SELECT FOR UPDATE's lock-ordering deadlock risk | User-confirmed during PLAN authoring (not deferred to an APPLY checkpoint), logged in STATE.md and Carl |
| Booking status = CONFIRMED on creation | No online payment flow exists until Phase 5; matches "front-desk manual booking" scope | Flagged as Assumption 1 for explicit user review, not silently decided |
| No Payment record created yet | Xendit/PayMongo wiring is Phase 5's job | Flagged as Assumption 2 — the clearest candidate for user follow-up |
| Type-check guest.email/phone, not just truthy-check | security-review finding — untyped fields used in Prisma `where` filters are a live injection vector | Applied immediately, independently re-verified live by gsd-security-auditor |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Security-review finding (guest.email type-checking), fixed same session, independently re-verified |
| Scope additions | 0 | — |
| Deferred | 0 (new) | — |

**Total impact:** One real security gap found and closed within this same plan's execution, before UNIFY — not deferred, not shipped unfixed.

### Auto-fixed Issues

**1. [Security] `guest.email` used in Prisma `where` filters without type validation**
- **Found during:** security-review pass, after Task 1 implementation
- **Issue:** Every other client-supplied field (`roomTypeId`, `ratePlanId`, dates, `firstName`, `lastName`) was explicitly type-checked; `guest.email` was only truthy-checked, allowing a filter-operator object (e.g. `{"not": null}`) to be interpreted by Prisma as a query operator instead of a literal value in the duplicate-check and guest-lookup queries
- **Fix:** Added `typeof guest.email !== "string"` (and the same for `guest.phone`, for consistency) to the existing input-validation block
- **Files:** `src/routes/bookings.ts`
- **Verification:** New regression test added to `smoke-test-booking-flow.ts`; independently re-probed live by `gsd-security-auditor` with 9 attack-shape variants beyond the one already tested — all rejected with 400 before touching the database

### Deferred Items

None new. This plan's own explicitly-scoped-out items (Payment records, minStay enforcement, multi-room-type-per-booking, booking modification/cancellation, OTA/webhook bookings, React UI) are all documented in `<boundaries>` and the Assumptions Requiring Review section — reasoned exclusions, not silent gaps.

## Issues Encountered

One real issue, caught and closed within this plan's own execution rather than shipped: the `guest.email` type-validation gap above. This is the second plan in this project (after 02-01's timing side-channel) where the security pass caught something neither the enterprise audit nor manual implementation review found — reinforcing that the two-layer review (enterprise audit for architecture/completeness, security-review + live adversarial auditing for exploitability) is catching genuinely different classes of problem, not duplicating effort.

## Next Phase Readiness

**Ready:**
- A working, security-verified, concurrency-proven booking-creation endpoint — the highest-risk piece of Phase 2, now the most heavily-verified code in the project (enterprise audit + security-review + live adversarial security audit + 23 live smoke-test assertions across 2 dedicated test files)
- The conditional-UPDATE transaction pattern is now proven and directly reusable by Phase 4's Channex `booking_new` webhook handler, which will need the same atomicity guarantee against OTA-originated bookings
- `paul-plan-critic` subagent exists but was not invoked this plan (enterprise audit + security-review + live security-auditor already provided deep, non-redundant coverage; critic held in reserve for a plan where assumption-quality is the primary open question)

**Concerns (for user review, not blocking):**
- Assumption 1 (booking status = CONFIRMED not PENDING_PAYMENT) and Assumption 2 (no Payment record yet) are both still open for your explicit sign-off — see `02-03-PLAN.md`'s Assumptions Requiring Review section. Neither blocks correctness of what this plan does deliver.
- Unrelated to this plan: `.paul/PROJECT.md`, `.paul/ROADMAP.md`, `.paul/config.md`, and `.paul/SPECIAL-FLOWS.md` were edited outside this session and now say "PayMongo" where they previously said "Xendit" (Phase 5's payment provider). Worth reconciling — `.paul/PROJECT.md`'s Key Decisions table, Tech Stack table, and Constraints section still need to match whichever provider is actually current, and `SPECIAL-FLOWS.md`'s security-trigger language should stay accurate to the real provider name.
- minStay enforcement and multi-room-type-per-booking remain deliberately unbuilt (documented boundaries) — revisit if a real hotel's rate plans start relying on minimum-stay policies before Phase 3's admin UI ships.

**Blockers:**
- None.

**Phase 2 status:** 3 of an estimated 4 plans complete (auth, calendar API, booking transaction). React calendar grid UI + walk-in booking form remains (02-04).

---
*Phase: 02-front-desk-booking-core, Plan: 03*
*Completed: 2026-08-18*
