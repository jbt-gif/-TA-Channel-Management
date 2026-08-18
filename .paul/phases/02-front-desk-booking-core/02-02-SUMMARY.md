---
phase: 02-front-desk-booking-core
plan: 02
subsystem: api
tags: [express, prisma, multi-tenant, calendar, tenant-isolation]

requires:
  - phase: 02-front-desk-booking-core (02-01)
    provides: requireAuth middleware, req.auth = {userId, hotelId, role}
  - phase: 01-data-model-foundation
    provides: RoomType, RatePlan, DailyInventory, RatePlanDailyRate schemas this plan queries
provides:
  - GET /api/room-types — hotel-scoped room-type + rate-plan list
  - GET /api/room-types/:roomTypeId/calendar — DailyInventory + RatePlanDailyRate grid, tenant-isolation enforced
  - The response shape (roomType, ratePlans, days[]) the future frontend (02-04) will consume directly
affects: [02-03-booking-transaction, 02-04-frontend-ui, phase-03-hotel-admin-config-ui]

tech-stack:
  added: []
  patterns:
    - "hotelId for every protected query comes exclusively from req.auth (verified JWT), never from client input — the actual tenant-isolation control, not just a convention"
    - "Cross-tenant and genuinely-nonexistent resource lookups return byte-identical 404 responses — prevents resource-existence enumeration across tenants"
    - "Full route handler bodies wrapped in one try/catch, including ownership/authorization checks, not just the later data-fetch steps"
    - "Response arrays iterate the full requested range explicitly (e.g. days[] per calendar date) rather than mapping over whatever rows happen to exist, with an explicit flag (seeded:false) for missing data instead of silent omission"

key-files:
  created:
    - src/routes/roomTypes.ts
    - src/scripts/smoke-test-calendar.ts
  modified:
    - src/app.ts
    - package.json
    - .paul/phases/02-front-desk-booking-core/SECURITY.md

key-decisions:
  - "404 (not 403) for cross-tenant roomTypeId access, and made response-body-identical to the nonexistent-id case — a 403 or a differently-worded 404 would itself leak whether the id exists"
  - "days[] built by iterating every calendar date in the requested range, not by mapping over existing DailyInventory rows — unseeded dates get seeded:false instead of vanishing from the array"
  - "Round-trip date validation (reformat parsed Date, compare to original string) added during audit — rejects impossible dates like 2026-02-30 that JS's lenient Date parsing would otherwise silently roll over"

patterns-established:
  - "Every future protected route scoping data by hotel must derive hotelId from req.auth only — verified again this plan, now the second endpoint following the pattern 02-01 established"
  - "gsd-security-auditor verification should include live adversarial probing (spoofing attempts, forced error injection), not just reading the code — this pass caught nothing new, but the method itself (proven in 02-01) is now the standard for security-flagged plans"

duration: "~1 session"
started: "2026-08-16"
completed: "2026-08-16"
---

# Phase 2 Plan 02: Calendar Grid Query API Summary

**Two protected, hotel-scoped read endpoints (room-type list, DailyInventory/RatePlanDailyRate calendar grid) built and live-verified against real cross-tenant attack scenarios — zero isolation gaps found.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1 session |
| Started | 2026-08-16 |
| Completed | 2026-08-16 |
| Tasks | 3 completed (room-types list, calendar grid endpoint, end-to-end smoke test) |
| Files modified | 2 created, 3 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Authenticated user can list their hotel's room types | Pass | Verified via smoke test and manual curl — 200 with correct data |
| AC-2: Room-type list never leaks another hotel's data | Pass | Explicit absence check (not just count) in both manual test and smoke test |
| AC-3: Calendar grid returns correct data for the authenticated hotel | Pass | Confirmed real seeded prices for both rate plans on a seeded date |
| AC-4: Cross-tenant roomTypeId access refused, not just filtered | Pass | 404, and confirmed byte-identical to the genuinely-nonexistent-id response |
| AC-5: Both endpoints require authentication | Pass | 401 for no-token on both routes |
| AC-6: Invalid date ranges rejected before any DB query | Pass | Missing dates, backwards range, >400-day range, and round-trip-invalid dates (2026-02-30) all correctly return 400 |

## Accomplishments

- First real query-level multi-tenant isolation in the project, proven — not just designed — against live cross-tenant attack scenarios
- The `seeded:false` edge case (audit-added) surfaced naturally during manual verification: today's actual seed horizon meant two of three requested dates genuinely lacked DailyInventory rows, and the fix handled it correctly on the first real-world hit, not just in a contrived test
- `gsd-security-auditor` went beyond reading code: forced the ownership-check's own DB call to throw (via monkey-patching) to prove the try/catch fix actually covers it, and wrote dedicated probes for the unseeded-date path the smoke test didn't originally cover — both held
- Zero regressions across all four existing smoke tests after this plan's changes

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/routes/roomTypes.ts` | Created | Both endpoints: room-type list, calendar grid with ownership check + date validation |
| `src/app.ts` | Modified | Mounted `roomTypesRouter` at `/api/room-types` |
| `src/scripts/smoke-test-calendar.ts` | Created | Idempotent end-to-end verification covering AC-1 through AC-6, including the cross-tenant/nonexistent-id byte-identity proof |
| `package.json` | Modified | Added `smoke-test-calendar` script |
| `.paul/phases/02-front-desk-booking-core/SECURITY.md` | Modified | Appended 02-02's threat-verification section (8/8 mitigations closed) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| 404 (not 403) for cross-tenant access, byte-identical to nonexistent-id | Audit finding — any distinguishable response leaks resource existence across tenants | Verified live by both the smoke test and the security auditor's adversarial probing |
| days[] iterates the full date range explicitly, seeded:false for gaps | Audit finding — silently shorter arrays are a data-completeness bug once real hotels have partially-seeded room types | Confirmed correct against a real unseeded-date scenario during manual testing, not just a synthetic one |
| Round-trip date validation | Audit finding — regex-only validation accepts calendar-impossible dates JS silently rolls over | One-line fix, directly tested with 2026-02-30 |
| Entire calendar handler wrapped in one try/catch | Audit finding — original draft left the ownership check outside error handling | Security auditor forced a live DB error specifically at that point to confirm the fix holds, not just inspected the code |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Minor, TypeScript-only, no scope creep |
| Scope additions | 0 | — |
| Deferred | 0 (new) | — |

**Total impact:** One small type-fix during build; otherwise plan executed exactly as written (as amended by the audit).

### Auto-fixed Issues

**1. [Structural] Express route param typing required an explicit cast**
- **Found during:** Task 2 (calendar endpoint), first build attempt
- **Issue:** `req.params.roomTypeId` typed as `string | string[]` by the project's Express type setup, not assignable directly to Prisma's string-typed `where` filters
- **Fix:** Explicit `as string` cast on the single route param — safe, since Express never produces an array for a single `:param` path segment
- **Files:** `src/routes/roomTypes.ts`
- **Verification:** Build passes clean; behavior unaffected (confirmed via smoke test)

### Deferred Items

None new — this plan introduced no deferred items beyond what its own boundaries section already explicitly scoped out (pagination, caching, role-based restriction), all reasoned rather than silent.

## Issues Encountered

None. Both required security checks (security-review, gsd-security-auditor) came back clean on the first pass — a contrast with 02-01, where the auditor caught a real timing bug. Worth noting plainly: a clean result here is not weaker verification, since the auditor still ran live adversarial probes (hotelId spoofing attempts, forced DB errors, a real unseeded-date scenario) rather than only reading code — the checks held under actual pressure, not just on inspection.

## Next Phase Readiness

**Ready:**
- Two working, security-verified protected endpoints the frontend (02-04) can build against with a known, stable response shape
- The `req.auth.hotelId`-only tenant-scoping pattern now proven twice (auth context in 02-01, query enforcement in 02-02) — the template every future Phase 2+ route should follow
- BookingItem's date-range/roomTypeId shape from Phase 1 lines up directly with this endpoint's grid query pattern, ready for 02-03's booking transaction to build on

**Concerns:**
- None blocking. Carried forward from the plan's own boundaries: no pagination, no caching, no role-based restriction — all deliberately deferred, not oversights.

**Blockers:**
- None.

**Phase 2 status:** 2 of an estimated 4 plans complete (auth, calendar API). Atomic booking transaction and the React frontend remain.

---
*Phase: 02-front-desk-booking-core, Plan: 02*
*Completed: 2026-08-16*
