---
phase: 03-hotel-admin-config-ui
plan: 01
subsystem: api
tags: [prisma, express, crud, multi-tenant, admin]

requires:
  - phase: 01-data-model-foundation
    provides: RoomType/RatePlan/Hotel schema, seedInventoryForRoomType()
  - phase: 02-front-desk-booking-core (02-02, 02-03)
    provides: tenant-scoped findFirst + byte-identical-404 pattern, ADMIN/role-gate pattern, Decimal-safe money handling

provides:
  - POST/PATCH/DELETE /api/room-types — hotel-scoped RoomType CRUD
  - POST /api/room-types/:roomTypeId/rate-plans, PATCH/DELETE /api/rate-plans/:id — RatePlan CRUD
  - GET/PATCH /api/hotel/policy — downpaymentPercent
  - Hotel.downpaymentPercent (+ DB CHECK 0-100), RoomType/RatePlan accountability fields (lastModifiedByUserId, deletedByUserId)

affects: [phase-3-frontend-admin-ui (03-02), phase-4-channex-integration]

tech-stack:
  added: []
  patterns:
    - "Deletion-safety check: soft-deleting a RoomType/RatePlan first checks for future non-cancelled BookingItems and returns 409 if found — prevents silently orphaning an active reservation from every staff-facing list/calendar view"
    - "Accountability trail on configuration writes (lastModifiedByUserId/deletedByUserId), mirroring Booking/Payment's Phase-1 precedent, extended here to non-financial config records because basePrice changes affect what guests get charged"
    - "New RoomType/RatePlan creation calls the existing seedInventoryForRoomType() rather than reimplementing seeding — keeps a newly created rate plan immediately bookable at basePrice across the full 365-day window"

key-files:
  created:
    - src/routes/ratePlans.ts
    - src/routes/hotel.ts
    - prisma/migrations/20260818081522_add_hotel_downpayment_percent_and_config_accountability_fields/
    - prisma/migrations/20260818081653_add_hotel_downpayment_check/
  modified:
    - prisma/schema.prisma
    - src/routes/roomTypes.ts
    - src/app.ts

key-decisions:
  - "Deletion of a RoomType/RatePlan with a future non-cancelled booking is blocked (409), not silently allowed — audit-caught must-have, not in the original plan draft"
  - "Room-unit (physical Room label) CRUD is explicitly out of scope for this plan — new room types seed with availableCount:0 until Rooms exist via the existing manual process; flagged in the plan's Assumptions section for the user's awareness, not silently expanded"

duration: "~1 session"
started: "2026-08-18"
completed: "2026-08-18"
---

# Phase 3 Plan 01: Hotel Admin Config API Summary

**Hotel admins can now create/update/soft-delete room types and rate plans, and view/update their hotel's downpayment policy, entirely through the API — the first time any of this project's configuration data was created by anything other than a hand-run script.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1 session |
| Started | 2026-08-18 |
| Completed | 2026-08-18 |
| Tasks | 3 completed (RoomType CRUD, RatePlan CRUD, hotel policy + accountability schema) |
| Files modified | 4 created, 3 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Admin can create a room type | Pass | Live-verified: 201, appears in GET list, calendar seeded (seeded:true, 0 available) |
| AC-2: Non-admin roles cannot configure | Pass | Live-verified: FRONT_DESK gets 403 on room-type create and policy update |
| AC-3: Admin can update and soft-delete a room type | Pass | Live-verified: PATCH updates reflected; DELETE removes from GET list |
| AC-4: Admin can create a rate plan that is immediately bookable | Pass | Live-verified: 201, calendar shows real price (not "No rate set") for every date in the window immediately |
| AC-5: Admin can update and soft-delete a rate plan | Pass | Live-verified: PATCH updates basePrice; DELETE (after clearing the blocking booking) succeeds |
| AC-6: Cross-tenant access is a byte-identical 404 | Pass | Live-verified: cross-tenant PATCH and nonexistent-id PATCH return byte-identical JSON bodies |
| AC-7: Admin can view and update hotel policy settings | Pass | Live-verified: default 20, PATCH to 50 persists, PATCH 150 → 400, DB CHECK constraint independently rejects an out-of-range value via direct SQL bypass |
| AC-8: Deleting a room type/rate plan with future bookings is blocked | Pass | Live-verified: DELETE on both a room type and a rate plan with a future CONFIRMED booking → 409; after cancelling the booking, DELETE succeeds |
| AC-9: Configuration changes carry an accountability trail | Pass | Live-verified: `lastModifiedByUserId` set on create, `deletedByUserId` set on delete |

## Accomplishments

- Full hotel-admin CRUD loop working end to end against a real dev database: create room type → create rate plan → both immediately visible and bookable (real prices, not placeholder) → update → blocked-then-allowed delete, all under real JWT auth with real role gating.
- Enterprise audit caught a genuine data-integrity gap before any code existed: nothing in the original draft stopped an admin from soft-deleting a room type or rate plan with an active future booking, which would have silently made that reservation unreachable from every staff-facing list/calendar view. Fixed and live-verified against a real future CONFIRMED booking, not just code-reviewed.
- Reused `seedInventoryForRoomType()` (built in Phase 1) rather than reimplementing seeding logic for new room types/rate plans — zero drift risk, and it correctly produced a rate plan bookable at basePrice across the full window on first creation.
- security-review found zero HIGH/MEDIUM findings — no mass-assignment surface (every field explicitly destructured, never spread into Prisma `data`), consistent tenant-scoped lookup + byte-identical-404 pattern reused from `roomTypes.ts`/`bookings.ts`.
- Self-verified all 9 ACs plus 3 audit-added checks (empty-PATCH-body rejection, accountability fields, deletion-safety block) via a throwaway script hitting the live dev server — 21/21 checks passed — before considering the plan done.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modified | Added `Hotel.downpaymentPercent`, `RoomType`/`RatePlan` accountability fields |
| `prisma/migrations/20260818081522_.../migration.sql` | Created | Column migration for the above |
| `prisma/migrations/20260818081653_.../migration.sql` | Created (hand-edited) | DB CHECK constraint: `downpaymentPercent` 0-100 |
| `src/routes/roomTypes.ts` | Modified | Added `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/rate-plans` |
| `src/routes/ratePlans.ts` | Created | `PATCH /:id`, `DELETE /:id` for rate plans |
| `src/routes/hotel.ts` | Created | `GET/PATCH /policy` |
| `src/app.ts` | Modified | Mounted `ratePlansRouter` at `/api/rate-plans`, `hotelRouter` at `/api/hotel` |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Block soft-delete of RoomType/RatePlan with future non-cancelled bookings (409) | Audit-caught: silent deletion would orphan an active reservation from staff view | Real data-integrity guarantee, not in the original plan draft |
| Add lastModifiedByUserId/deletedByUserId to RoomType/RatePlan | Mirrors Booking/Payment's Phase-1 accountability-field precedent; basePrice changes affect guest charges | Configuration changes are now attributable, same discipline as financial records |
| No physical Room (unit) CRUD in this plan | ROADMAP.md's Phase 3 scope names only RoomType/RatePlan CRUD + policy settings | New room types are configurable but not sellable (0 availableCount) until Rooms exist via the existing manual process — flagged for user awareness, not silently expanded |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 (all additions came from the audit, applied to the plan before APPLY, not improvised during APPLY) | — |
| Deferred | 3 (basePrice sanity ceiling, duplicate-submission guard, rate limiting) | Logged in 03-01-AUDIT.md, lower-stakes/self-correctable |

**Total impact:** Plan executed exactly as audited — no improvisation during APPLY. A local Windows-specific EPERM file lock (a running dev server holding the Prisma client DLL) needed a process restart mid-APPLY to regenerate the client; not a plan deviation, just local tooling friction.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `npx prisma generate` failed with EPERM (DLL locked by the running backend dev server) | Identified the process via its listening port (3000), stopped it, regenerated cleanly, restarted the dev server afterward |

## Next Phase Readiness

**Ready:**
- Backend CRUD API for room types, rate plans, and hotel policy is live, tested, and security-reviewed — 03-02 (frontend admin UI) can now consume it directly.
- The accountability-field pattern (lastModifiedByUserId/deletedByUserId) and deletion-safety check are reusable precedents for any future admin-config endpoint (e.g. a future Room-unit CRUD, if that gap gets addressed).

**Concerns (for user review, not blocking):**
- Room-unit (physical Room) CRUD remains unaddressed — new room types are visible/configurable but show 0 availability until Rooms exist via the manual process. Not scheduled in any named phase currently.
- Carried forward, unrelated to this plan: CORS backend config needed before real deployment; 02-03's Assumptions 1-2 (booking status, no Payment record) still await sign-off.

**Blockers:**
- None.

**Phase 3 status: In progress — 1 plan complete (backend API), frontend admin UI (03-02) not yet planned.**

---
*Phase: 03-hotel-admin-config-ui, Plan: 01*
*Completed: 2026-08-18*
