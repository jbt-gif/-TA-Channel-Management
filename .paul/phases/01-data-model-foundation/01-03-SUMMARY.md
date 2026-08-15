---
phase: 01-data-model-foundation
plan: 03
subsystem: database
tags: [prisma, postgresql, supabase, multi-tenant, booking, payments, check-constraints]

requires:
  - phase: 01-data-model-foundation (01-01, 01-02)
    provides: RoomType/RatePlan/Room core schema; DailyInventory/RatePlanDailyRate shared-availability model
provides:
  - Guest, Booking, BookingItem, Payment, ChannelMapping models — completes Phase 1's data model foundation
  - Accountability fields (Booking.createdByUserId, Payment.processedByUserId) for audit/dispute-resolution traceability
  - Booking.totalAmount and BookingItem.totalPriceSnapshot as authoritative financial fields, correctly shaped against the per-date rate model from 01-02
  - DB-level CHECK constraints on BookingItem dates/quantity/price, Payment amount, Booking totalAmount
  - Idempotent end-to-end smoke test proving the full Guest→Booking→BookingItem→Payment→ChannelMapping chain
affects: [phase-02-front-desk-booking-core, phase-04-channex-integration, phase-05-xendit-payments]

tech-stack:
  added: []
  patterns:
    - "Financial/audit records (Booking, Payment) use a status enum instead of soft-delete — deletedAt would hide history needed for reconciliation/dispute resolution"
    - "Price snapshots on line-item records must capture the computed TOTAL for the record's scope, never a flat per-unit figure, whenever the underlying rate source varies (RatePlanDailyRate is per-date)"
    - "Accountability fields (createdByUserId/processedByUserId) added as nullable FKs to User wherever a human action needs to be attributable, from schema time — not retrofitted after real records exist"
    - "Placeholder integration fields (externalBookingId, externalReference, ChannelMapping.externalId) added now as nullable, populated later by the phase that owns the real integration"

key-files:
  created:
    - src/scripts/smoke-test-booking.ts
    - prisma/migrations/20260815091329_add_booking_core_models/migration.sql
    - prisma/migrations/20260815091415_add_payment_channel_mapping/migration.sql
    - prisma/migrations/20260815091432_add_booking_check_constraints/migration.sql
  modified:
    - prisma/schema.prisma
    - package.json

key-decisions:
  - "BookingItem.totalPriceSnapshot (not pricePerNightSnapshot) — audit caught that a flat per-night figure would silently misstate totals whenever RatePlanDailyRate's per-date pricing varies across a stay"
  - "Booking.createdByUserId and Payment.processedByUserId added — no accountability trail existed in the original plan for a system handling real money"
  - "Booking.totalAmount added as a nullable field Phase 2 will populate — gives Payment something authoritative to reconcile against"
  - "No deletedAt on Booking or Payment — cancellation/failure are statuses, not deletions, matching the reasoning already established for DailyInventory/RatePlanDailyRate in 01-02"

patterns-established:
  - "Every model recording a human-initiated action needs a nullable actor FK from day one, not added after real usage exists"
  - "Any snapshot field capturing a price from a source that varies per-unit (date, room, etc.) must be named and scoped as a TOTAL, not a per-unit rate, to avoid silent miscalculation"

duration: "~1 session"
started: "2026-08-15"
completed: "2026-08-15"
---

# Phase 1 Plan 03: Booking, Payment & Channel Mapping Summary

**Guest, Booking, BookingItem, Payment, and ChannelMapping models migrated with DB-level CHECK constraints and accountability fields; full booking chain proven end-to-end against the real Supabase dev database, closing out Phase 1's data model foundation.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1 session |
| Started | 2026-08-15 |
| Completed | 2026-08-15 |
| Tasks | 3 completed (booking-core migration, payment/channel-mapping migration + CHECK constraints, end-to-end smoke test) |
| Files modified | 2 created (smoke test, this summary), 2 modified (schema, package.json), 3 migrations |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: All five models follow the multi-tenant isolation pattern | Pass | hotelId, cuid ids, onDelete:Restrict, @@index([hotelId]) confirmed on all five, including an explicit standalone index added to ChannelMapping during audit |
| AC-2: Full booking chain creates and links correctly | Pass | Guest→Booking→2×BookingItem→Payment→2×ChannelMapping all created, hotelId-scoped, traceable via Prisma includes |
| AC-3: Booking cancellation never destroys history | Pass | CANCELLED status set, row and both BookingItems confirmed still queryable afterward |
| AC-4: BookingItem carries a total price snapshot, not a live reference | Pass | totalPriceSnapshot remained 3500 after the underlying RatePlanDailyRate.price was changed to 4000 |
| AC-5: ChannelMapping links either a RoomType or a RatePlan | Pass | One ROOM_TYPE row, one RATE_PLAN row, each with the correct single FK set and the other null |
| AC-6: DB rejects structurally invalid data | Pass | BookingItem bad date range, Payment amount 0, Booking totalAmount 0 all rejected live; fresh Booking with totalAmount left null correctly accepted |
| AC-7 (audit-added): Booking/Payment record which staff member acted | Pass | createdByUserId and processedByUserId both resolved to the correct User via Prisma include |

## Accomplishments

- Phase 1's full data model foundation is now complete and live — all 12 models (Hotel, User, RoomType, RatePlan, Room, DailyInventory, RatePlanDailyRate, Guest, Booking, BookingItem, Payment, ChannelMapping) migrated and proven against real data
- Audit caught a real financial-correctness bug before any code shipped — a flat per-night price snapshot would have silently misstated totals the first time a rate plan had date-varying pricing (the exact scenario 01-02 built RatePlanDailyRate to support)
- Accountability trail (who created a booking, who processed a payment) now exists at the schema level, closing a gap that would have failed a real audit
- 15/15 smoke-test checks passed across 2 separate runs; full project build and both prior smoke tests (01-01, 01-02) re-verified with zero regressions from the new schema

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modified | Added Guest, Booking, BookingItem, Payment, ChannelMapping models + BookingStatus/BookingSource/PaymentMethod/PaymentStatus/ChannelMappingType enums |
| `prisma/migrations/20260815091329_add_booking_core_models/migration.sql` | Created | Guest, Booking, BookingItem schema migration |
| `prisma/migrations/20260815091415_add_payment_channel_mapping/migration.sql` | Created | Payment, ChannelMapping schema migration |
| `prisma/migrations/20260815091432_add_booking_check_constraints/migration.sql` | Created | Raw SQL CHECK constraints (hand-edited, --create-only) |
| `src/scripts/smoke-test-booking.ts` | Created | Idempotent end-to-end verification script covering AC-1 through AC-7 |
| `package.json` | Modified | Added `smoke-test-booking` script |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Renamed pricePerNightSnapshot → totalPriceSnapshot | Audit finding — a flat per-night figure contradicts 01-02's per-date RatePlanDailyRate model and would silently misstate totals when rates vary across a stay | Phase 2 must compute this as a true total (walking per-night rates), not a simple multiplication |
| Added Booking.createdByUserId, Payment.processedByUserId (nullable) | Audit finding — no accountability trail for who took a booking or processed a payment | Phase 2/5 should populate these when building real booking/payment creation; nullable supports Phase 4 OTA / Phase 5 webhook paths with no staff actor |
| Added Booking.totalAmount (nullable) | Audit finding — Payment had nothing authoritative to reconcile against | Phase 2 populates this when computing the real booking total |
| No deletedAt on Booking/Payment | Matches 01-02's isClosed-not-delete reasoning for grid tables — cancellation/failure are statuses, deletion would destroy required audit history | Established as the pattern for any future financial/audit-record model |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Structural, no scope creep |
| Scope additions | 0 (audit-driven fields already reflected in the applied plan) | — |
| Deferred | 3 (new, from audit) | Named owners assigned |

**Total impact:** One structural build-order fix during execution; otherwise plan executed exactly as written (as amended by the audit).

### Auto-fixed Issues

**1. [Structural] Payment forward-reference broke schema validation on first migration**
- **Found during:** Task 1 (Add Guest/Booking/BookingItem)
- **Issue:** Booking's `payments Payment[]` reverse relation was written before the Payment model existed (Payment is added in Task 2), causing `npx prisma migrate dev` to fail schema validation
- **Fix:** Removed the `payments` reverse relation from Booking's Task 1 migration, added it back in Task 2 once Payment was defined — standard incremental-schema build order
- **Files:** `prisma/schema.prisma`
- **Verification:** Both migrations then applied cleanly against the real Supabase dev database

### Deferred Items

Three items surfaced during the 01-03 audit, all classified can-safely-defer (see `01-03-AUDIT.md` §4 for full rationale):
1. Physical Room-number assignment on BookingItem — belongs to check-in workflow (Phase 2/6), current room-type+quantity granularity matches how OTAs and this project's own DailyInventory model already work
2. Schema-level guard against duplicate/overlapping BookingItem lines within one Booking — better enforced in Phase 2's atomic booking transaction
3. Standalone `@@index([ratePlanId])` on BookingItem — existing compound index covers the primary access pattern; add later only if needed

## Issues Encountered

None beyond the auto-fixed forward-reference build-order issue above.

## Next Phase Readiness

**Ready:**
- All 12 Phase-1-scoped models exist, are migrated, and are proven correct against real data
- Financial/audit-sensitive fields (price snapshot, accountability, no-soft-delete) correctly designed before any real booking or payment exists
- BookingItem's shape (roomTypeId + ratePlanId + date range + quantity) is exactly what Phase 2's atomic overbooking-safe transaction needs to walk against DailyInventory
- ChannelMapping and externalBookingId/externalReference placeholders are ready for Phase 4/5 without any premature integration logic having been built

**Concerns:**
- None blocking. Carried forward from prior deferrals: written service agreement, super-admin view, Supabase dev-vs-staging decision (Phase 7), availableCount sync on Room changes (Phase 3/6) — see STATE.md Deferred Issues.
- New (from this plan's audit, all deferred with named future owners): Room-number assignment (Phase 2/6), duplicate-BookingItem-line validation (Phase 2)

**Blockers:**
- None.

**Phase 1 status:** 3 of 3 plans complete. Phase 1 (Data model + inventory foundation) is now fully done — routing to mandatory phase transition.

---
*Phase: 01-data-model-foundation, Plan: 03*
*Completed: 2026-08-15*
