# Enterprise Plan Audit Report

**Plan:** .paul/phases/01-data-model-foundation/01-03-PLAN.md
**Audited:** 2026-08-15
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Not enterprise-ready as originally written — one real correctness bug (a financial-data-modeling error that contradicts a decision made two plans ago) and one real accountability gap (no record of which staff member acted on a booking or payment). Both are release-blocking for a system that handles real money and will be reviewed after the fact when something goes wrong. Neither is cosmetic; both are now fixed directly in the plan. Conditionally acceptable as amended — I would sign off on the amended version, not the original.

## 2. What Is Solid

- **No hard/soft delete on Booking and Payment.** Correctly reasoned as financial/audit records where "cancelled" must remain a queryable status, not a vanished row. This is the same discipline the project applied to DailyInventory/RatePlanDailyRate in 01-02 (isClosed instead of delete), applied consistently to a different but analogous problem.
- **externalBookingId / externalReference / ChannelMapping.externalId as nullable placeholders.** Correctly closes the "expensive to retrofit after real data exists" gap for Phase 4/5 without building any Phase 4/5 logic prematurely — same precedent as 01-01's RatePlan.hotelId denormalization.
- **CHECK constraints planned via the same raw-SQL --create-only pattern established in 01-02**, applied consistently rather than reinvented.
- **Room-type-level (not physical-room-level) booking granularity**, correctly deferred as matching how DailyInventory's shared-count model and OTA channel managers already work — physical room assignment is a check-in-time concern, not a booking-time one.

## 3. Enterprise Gaps Identified

- **Silent financial misstatement risk:** the original `pricePerNightSnapshot` field assumes a uniform nightly rate, but Plan 01-02 deliberately keyed `RatePlanDailyRate` per calendar date specifically because nightly rates vary (weekday/weekend). A flat per-night snapshot times nights would not equal the real total whenever rates varied across a stay — a correctness bug baked into the schema, not just an omission.
- **No accountability/audit trail for who created a booking or processed a payment.** For a front-desk system handling real money, "which staff member did this" is a baseline requirement for dispute resolution and post-incident reconstruction — its absence would fail a real audit.
- **No authoritative total-charge field on Booking.** Payment.amount had nothing to reconcile against; a booking's own expected total wasn't recorded anywhere on the booking itself.
- **Internal inconsistency:** the plan's own AC-1 claimed a universal `@@index([hotelId])` pattern, but ChannelMapping only had hotelId as a composite-index prefix, not a standalone index.
- **Minor query-pattern gaps:** no index for guest booking-history lookups (`Booking.guestId`) or front-desk repeat-guest lookup (`Guest.email`).

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | BookingItem price field assumed uniform nightly rate, contradicting 01-02's per-date rate model | Task 1 (BookingItem), AC-4, AC-6, Task 2 (CHECK constraints), Task 3 (smoke test) | Renamed `pricePerNightSnapshot` → `totalPriceSnapshot`; documented it as the pre-computed full-stay total Phase 2 must derive by walking per-date rates, not a flat per-night figure |
| 2 | No record of which staff member created a booking or processed a payment | Task 1 (Booking), Task 2 (Payment), new AC-7, Task 3 (smoke test) | Added nullable `Booking.createdByUserId` and `Payment.processedByUserId`, both FK -> User onDelete:Restrict, both nullable to support Phase 4/5 non-staff-initiated rows |
| 3 | No authoritative total-charge field on Booking | Task 1 (Booking), Task 2 (CHECK constraints), Task 3 (smoke test) | Added nullable `Booking.totalAmount` with CHECK `totalAmount IS NULL OR totalAmount > 0` |
| 4 | ChannelMapping lacked the standalone `@@index([hotelId])` AC-1 claims is universal | Task 2 (ChannelMapping) | Added explicit `@@index([hotelId])` alongside the existing composite unique index |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | No index for guest booking-history lookups | Task 1 (Booking) | Added `@@index([guestId])` |
| 2 | No index for front-desk repeat-guest lookup by email | Task 1 (Guest) | Added non-unique `@@index([hotelId, email])` (not unique — a shared household email is legitimate) |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 1 | No physical Room-number assignment on BookingItem | Matches how OTAs and this project's own DailyInventory model already work (room-type + count, not specific rooms); specific assignment is a check-in-time concern for Phase 2/6, not this schema-foundation plan |
| 2 | No schema-level guard against duplicate/overlapping BookingItem lines within one Booking | Better enforced as application logic inside Phase 2's atomic booking transaction, which already owns overbooking-safety logic; a DB-level guard here would be premature without that transaction shape decided |
| 3 | No standalone `@@index([ratePlanId])` on BookingItem | The existing `roomTypeId, checkInDate, checkOutDate` compound index covers Phase 2's primary access pattern; add a ratePlanId index later only if a genuine ratePlanId-only query pattern emerges |

## 5. Audit & Compliance Readiness

With the must-have fixes applied: Booking/Payment now carry both a "who acted" field and an authoritative total, closing the two gaps that would otherwise fail a real financial audit or dispute-resolution request. Silent failure risk from the price-snapshot bug is closed — the field can no longer misrepresent a booking's real cost due to a schema-level assumption. Remaining gap: no application-level enforcement yet that `createdByUserId`/`processedByUserId` are actually populated for staff-initiated actions — that enforcement belongs to Phase 2 (booking creation) and Phase 5 (payment processing) since no API routes exist yet in this plan to enforce it against. Tracked as their responsibility, not silently assumed.

## 6. Final Release Bar

**Must be true before this plan ships (as amended):** both CHECK-constraint migrations apply cleanly and are confirmed live via a rejected raw-SQL write (not just present in migration.sql); the smoke test proves the full Guest→Booking→BookingItem→Payment chain including the renamed totalPriceSnapshot field and the new createdByUserId/processedByUserId/totalAmount fields.

**Risk remaining if shipped as amended:** Phase 2 and Phase 5 must actually populate createdByUserId/processedByUserId/totalAmount when they build real booking/payment creation — this plan only makes the fields exist and behave correctly, it does not force their use. That responsibility is now explicit rather than assumed.

I would sign off on this plan as amended. I would not have signed off on the original — the price-snapshot bug alone would have produced silently wrong financial totals the first time a rate plan had date-varying prices.

---

**Summary:** Applied 4 must-have + 2 strongly-recommended upgrades. Deferred 3 items.
**Plan status:** Updated and ready for APPLY

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
