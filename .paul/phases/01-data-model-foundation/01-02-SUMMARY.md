---
phase: 01-data-model-foundation
plan: 02
subsystem: database
tags: [prisma, postgresql, supabase, inventory, check-constraints, timezone]

requires: [01-01-backend-scaffold-core-schema]
provides:
  - DailyInventory model — shared room-type-level availability, one row per [roomTypeId, date]
  - RatePlanDailyRate model — per-rate-plan price/minStay, one row per [ratePlanId, date]
  - RatePlan.basePrice field
  - Database-level CHECK constraints enforcing bookedCount+heldCount<=availableCount, minStay>=1, basePrice>0
  - Reusable seedInventoryForRoomType() 365-day seed worker, Asia/Manila-aware and idempotent
  - Idempotent smoke-test-inventory.ts proving shared-count, per-rate-plan pricing, zero-Rooms edge case, and idempotency
affects: [01-03-guest-booking-payment, phase-02-front-desk-booking-core, phase-03-hotel-admin-config-ui, phase-06-mobile-housekeeping]

tech-stack:
  added: []
  patterns:
    - "Shared availability at room-type level (DailyInventory), independent price/minStay at rate-plan level (RatePlanDailyRate) — never merge these two concerns into one table"
    - "Database-level CHECK constraints as the real overbooking backstop, not just application/transaction logic"
    - "Grid tables (calendar rows) use isClosed for stop-sell, not deletedAt soft-delete — deletion would create date gaps"
    - "Timezone-sensitive date computation must use a fixed Asia/Manila offset, never server-local time or raw new Date()"
    - "Raw SQL migration (--create-only, hand-edited) for multi-column CHECK constraints Prisma's schema DSL can't express"

key-files:
  created:
    - src/lib/seed-inventory.ts
    - src/scripts/smoke-test-inventory.ts
    - prisma/migrations/.../add_daily_inventory_and_rate_plan_rates/migration.sql
    - prisma/migrations/.../add_inventory_check_constraints/migration.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Corrected the original DailyInventory design (keyed [roomTypeId, ratePlanId, date]) before building — would have let each rate plan track independent availability, allowing the same physical rooms to be oversold across multiple rate plans. Split into shared DailyInventory + separate RatePlanDailyRate."
  - "CHECK constraint (bookedCount+heldCount<=availableCount) added at the database level, not left to Phase 2's application logic alone — this is the actual overbooking backstop"
  - "RatePlan.basePrice added as required field, safe now only because no real hotel data exists yet (only 01-01 smoke-test rows, cleared before migrating)"

patterns-established:
  - "Every grid/calendar table follows the shared-count-vs-per-entity-attribute split when a similar one-to-many relationship arises"
  - "Every future money-handling migration should consider a CHECK constraint for validity (>0, >=0, etc.) rather than relying on application validation alone"

duration: "~1 session"
started: "2026-08-15"
completed: "2026-08-15"
---

# Phase 1 Plan 02: Daily Inventory + Seed Worker Summary

**DailyInventory (shared) and RatePlanDailyRate (per-rate-plan) models migrated with DB-level overbooking CHECK constraints; 365-day Asia/Manila-aware seed worker built and proven idempotent against real data.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1 session |
| Started | 2026-08-15 |
| Completed | 2026-08-15 |
| Tasks | 2 completed (schema+migration, seed worker+smoke test) |
| Files modified | 2 created (seed worker, smoke test), 1 modified (schema), 2 migrations |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Availability shared across rate plans, not independent | Pass | One DailyInventory row per [roomTypeId, date], availableCount 3 shared by both RatePlans |
| AC-2: Rate plans have independent price/minStay only | Pass | RatePlanDailyRate has one row per [ratePlanId, date], no availableCount field on the model at all |
| AC-3: Seed covers exactly 365 days from today in Asia/Manila | Pass | Verified earliest date matches Asia/Manila today, not UTC/server-local |
| AC-4: Seed worker is idempotent | Pass | Second run: 0 created, 365 skipped, no unique-constraint errors — verified across 2 separate process invocations |
| AC-5 (audit-added): DB rejects overbooking via CHECK constraint | Pass | Manual raw SQL UPDATE pushing bookedCount+heldCount above availableCount confirmed rejected live |
| AC-6 (audit-added): Zero-Rooms RoomType seeds without error | Pass | 365 rows created at availableCount 0, no error |

## Accomplishments

- Caught and corrected a real overselling design flaw before any code was written, not after
- Overbooking prevention now enforced at the database level, independent of any future application bug in Phase 2
- Seed worker proven correct on 4 distinct scenarios in one script: shared count, per-rate-plan pricing (checked individually per plan, not just aggregate total), zero-Rooms edge case, and idempotency
- Second full process run (not just a repeated in-process call) confirms idempotency holds across process boundaries

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modified | Added DailyInventory, RatePlanDailyRate models; RatePlan.basePrice field |
| `prisma/migrations/.../add_daily_inventory_and_rate_plan_rates/migration.sql` | Created | Schema migration for both new models + basePrice |
| `prisma/migrations/.../add_inventory_check_constraints/migration.sql` | Created | Raw SQL CHECK constraints (hand-edited, --create-only) |
| `src/lib/seed-inventory.ts` | Created | `seedInventoryForRoomType()` — 365-day Asia/Manila-aware idempotent seeder |
| `src/scripts/smoke-test-inventory.ts` | Created | Idempotent verification script covering AC-1 through AC-6 |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Split DailyInventory (shared) from RatePlanDailyRate (per-rate-plan) | Original single-table design keyed by [roomTypeId, ratePlanId, date] would allow overselling the same physical rooms across rate plans | Core to zero-overbookings success metric; corrected before any code existed |
| DB-level CHECK constraint via raw SQL migration | Prisma schema DSL can't reliably express multi-column CHECK constraints; app-only enforcement is not a real backstop against bugs | Overbooking now impossible to write to the database even if Phase 2 transaction logic has a bug |
| Fixed UTC+8 offset for "today" computation | Server timezone (deployment target unknown) or raw `new Date()` would silently shift the grid by a day at certain hours | Seed always starts from the correct Asia/Manila calendar date regardless of where the server runs |
| No deletedAt on DailyInventory/RatePlanDailyRate | These are calendar grid rows, not lifecycle entities; deletion would create unhandled date gaps | isClosed (stop-sell) is the correct domain operation, established as the pattern for future grid tables |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 1 (carried, not new) | Named owner assigned, tracked in STATE.md |

**Total impact:** Plan executed as written (as amended by the audit). No deviations during APPLY.

### Deferred Items

**1. Keeping DailyInventory.availableCount in sync with Room changes**
- **Origin:** 01-02 audit
- **Notes:** Seeding sets availableCount once at seed time; nothing yet keeps it correct if Rooms are added/removed/marked OOS afterward
- **Owner:** Phase 3 (room management UI) and Phase 6 (housekeeping OOS status)
- **Status:** Already tracked in STATE.md Deferred Issues — not new

## Issues Encountered

None. Both migrations and both smoke-test runs succeeded on first attempt against the real Supabase dev database.

## Skill Audit

No specialized flows required for this plan (per SPECIAL-FLOWS.md — `security-review`/`gsd-security-auditor` scoped to payment/webhook/tenant-query-enforcement phases only). Skill audit: N/A — none required. ✓

## Next Phase Readiness

**Ready:**
- Shared-availability data model is correct and proven with real data, including the edge case (zero Rooms) Phase 3 will actually produce
- CHECK constraint backstop is live — Phase 2's booking logic can rely on the database itself refusing an overselling write
- Seed worker is a reusable function, ready to be wired to RoomType creation in Phase 3

**Concerns:**
- None blocking. Carried forward: availableCount sync on Room changes still needs Phase 3/6 ownership (tracked, not forgotten).

**Blockers:**
- None.

**Phase 1 status:** 2 of 3 plans complete. Plan 01-03 (Guest, Booking, BookingItem, Payment, ChannelMapping models + multi-tenant scoping enforcement) is the last plan before Phase 1 is done.

---
*Phase: 01-data-model-foundation, Plan: 02*
*Completed: 2026-08-15*
