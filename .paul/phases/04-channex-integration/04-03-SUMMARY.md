---
phase: 04-channex-integration
plan: 03
subsystem: api
tags: [prisma, express, channex, queue]

requires:
  - phase: 04-01
    provides: ChannelMapping, Hotel.channexPropertyId
  - phase: 04-02
    provides: RatePlan.otaPrice, pushAvailability/pushRestrictions signatures the future worker will call
provides:
  - PushQueue table (durable record of pending pushes)
  - Enqueue wiring on ratePlans.ts PATCH (rate change) and bookings.ts POST (availability change)
  - otaPrice now PATCH-able via the rate-plans API (previously only settable by a throwaway script)
affects: [04-04 background worker]

tech-stack:
  added: []
  patterns: ["enqueue-after-commit (never inside the triggering transaction)", "local-origin-only trigger (webhook-originated changes excluded)"]

key-files:
  created: [prisma/migrations/20260824033820_add_push_queue/migration.sql]
  modified: [prisma/schema.prisma, src/routes/ratePlans.ts, src/routes/bookings.ts]

key-decisions:
  - "PushQueue rows store dateFrom/dateTo (a range), not a value snapshot — worker reads current DB state at push time to avoid staleness"
  - "otaPrice PATCH acceptance added as the minimum needed for a real trigger point, not full admin UI"
  - "Webhook-originated inventory changes never enqueue — avoids wasting Channex's 10 req/min/property budget re-telling it about its own data"

patterns-established:
  - "Enqueue writes happen as their own try/catch AFTER the real mutation commits — a queue-insert failure never rolls back or fails a request that already succeeded"

duration: ~35min
completed: 2026-08-23T00:00:00Z
---

# Phase 4 Plan 03: Change-tracking (PushQueue) Summary

**`PushQueue` table + enqueue wiring on local-origin rate/availability changes — the durable input 04-04's background worker will consume; no push happens yet.**

## Performance

| Metric | Value |
|--------|-------|
| Tasks | 2 completed |
| Files modified | 3 (+1 migration) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Local rate change enqueues a RATE push | Pass | PATCH otaPrice → 1 PENDING RATE row, correct ratePlanId, dateTo = dateFrom + 365d |
| AC-2: Local availability change enqueues an AVAILABILITY push | Pass | Walk-in booking create → 1 PENDING AVAILABILITY row, dateFrom/dateTo match stay range |
| AC-3: No channel mapping means no queue noise | Pass | Both branches tested: unmapped rate plan (0 rows), mapped-but-unconnected hotel/no channexPropertyId (0 rows) |
| AC-4: Webhook-originated changes never re-enqueue a push | Pass | Confirmed structurally — `git diff --stat` shows zero changes to `channexWebhook.ts` |
| AC-5: A failed mutation never enqueues a push | Pass | Over-capacity booking (409) → 0 additional rows |

## Accomplishments

- `PushQueue` table live in the DB with `PushQueueType`/`PushQueueStatus` enums, indexed on `[hotelId, status]` for the future worker's poll query
- `ratePlans.ts` PATCH now accepts `otaPrice` (positive number or `null` to clear) — closes a real gap found during planning: there was previously no API path to set the field at all outside a throwaway script
- Enqueue wiring proven end-to-end via 14 live checks against a real Express server + real DB (two hotels, mapped/unmapped/unconnected permutations)
- Existing `smoke-test-booking-flow` re-confirmed passing — zero regression on the walk-in booking path

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modified | Added `PushQueueType`, `PushQueueStatus` enums, `PushQueue` model, `Hotel.pushQueue` relation |
| `prisma/migrations/20260824033820_add_push_queue/migration.sql` | Created | Hand-written migration (enums + table + FK + index), applied via `prisma migrate deploy` |
| `src/routes/ratePlans.ts` | Modified | Accept `otaPrice` in PATCH body; enqueue a RATE row after a committed otaPrice/basePrice change, when mapped + connected |
| `src/routes/bookings.ts` | Modified | Enqueue an AVAILABILITY row after a committed walk-in booking, when mapped + connected |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Queue rows store a date range, not a value snapshot | Worker (04-04) re-reads current `RatePlan`/`DailyInventory` state at push time — avoids staleness if multiple local changes land before the worker runs | 04-04 must compute the actual push value itself, not trust anything cached in the queue row |
| Rate-change enqueue always spans a flat 365-day window from today | Matches `otaPrice`'s existing flat (non-per-date) design from 04-02 and this project's existing 365-day inventory-seed horizon | No new arbitrary constant invented; consistent with prior conventions |
| `otaPrice` PATCH acceptance added now, not deferred | No real trigger point existed to enqueue from otherwise; scoped to field acceptance only, not a form/UI | Admin UI for setting markup remains a separate, unnamed future plan |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | Plan already anticipated the `otaPrice` PATCH gap explicitly |
| Deferred | 0 new | — |

**Total impact:** None — plan executed exactly as written, including the pre-identified `otaPrice` PATCH-field gap.

### Deferred Items

None new. Existing Phase 4 deferred items (concurrent-multi-event-ordering, real-webhook re-verification before go-live) unaffected by this plan.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- `PushQueue` table populated by real mutation traffic, ready for 04-04's worker to poll `WHERE status = PENDING`
- `pushAvailability`/`pushRestrictions` (04-02) and `PushQueue` (this plan) are the two halves 04-04 assembles

**Concerns:**
- 04-04 must decide how to compute the actual push value from a queue row (re-read `RatePlan.otaPrice ?? basePrice` for RATE; re-read `DailyInventory.availableCount - bookedCount - heldCount` for AVAILABILITY) — not yet designed, this plan only records that a push is needed
- 04-04 must respect Channex's 10 req/min/property limit across potentially many queued rows for the same property — batching/throttling strategy not yet designed

**Blockers:** None

---
*Phase: 04-channex-integration, Plan: 03*
*Completed: 2026-08-23*
