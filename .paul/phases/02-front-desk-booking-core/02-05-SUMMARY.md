---
phase: 02-front-desk-booking-core
plan: 05
subsystem: frontend
tags: [react, calendar, ari-grid, first-real-data-view]

requires:
  - phase: 02-front-desk-booking-core (02-04)
    provides: AuthContext, ProtectedRoute, apiFetch (Bearer-token attach + 401 handling), the Dashboard route this plan replaces the content of
  - phase: 02-front-desk-booking-core (02-02)
    provides: GET /api/room-types, GET /api/room-types/:id/calendar — the exact response shapes this plan's UI consumes verbatim
provides:
  - frontend/src/api/roomTypes.ts — typed API client for room-types/calendar, reusable by 02-06's booking form
  - frontend/src/components/CalendarGrid.tsx — presentational availability/pricing grid with a proven 4-state cell model (available/sold-out/unseeded/no-rate-set)
  - The Manila-anchored date-computation pattern (mirroring seed-inventory.ts client-side), reusable by 02-06 and any future date-window UI
affects: [02-06-booking-form-ui]

tech-stack:
  added: []
  patterns:
    - "Frontend never re-derives availability/pricing numbers — always renders the API's own values verbatim, treating the backend as the single source of truth"
    - "Client-side 'today' is computed via the same +8h-offset/UTC-midnight convention as the backend's seed worker, never via browser-local-timezone-dependent Date methods"
    - "Rapid re-fetch triggers (week nav, room-type switch) are guarded with AbortController — an in-flight request's response is discarded once a newer request has been fired, preventing stale data from silently winning a race"
    - "A missing per-cell data point (rate plan with no rate for a seeded date) gets its own explicit UI state, not conflated with 'unseeded' or left to crash on undefined access"

key-files:
  created:
    - frontend/src/api/roomTypes.ts
    - frontend/src/components/CalendarGrid.tsx
  modified:
    - frontend/src/pages/Dashboard.tsx

key-decisions:
  - "No design-taste pass applied — user explicitly deferred ('designing is for later'); plain functional Tailwind, same as 02-04's Login page"
  - "14-day rolling window with week-step navigation, not a full date-range picker — sufficient for front-desk use, avoids unnecessary component complexity"
  - "One room type visible at a time via selector, not a multi-room-type overview — matches the calendar API's own per-room-type shape"

duration: "~1 session"
started: "2026-08-18"
completed: "2026-08-18"
---

# Phase 2 Plan 05: Calendar Grid UI Summary

**The actual ARI (availability/rate/inventory) view PROJECT.md's Core Value promises — front-desk staff can now see real availability and pricing before deciding to book, verified live against seeded sold-out and missing-rate edge cases, not just the happy path.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1 session |
| Started | 2026-08-18 |
| Completed | 2026-08-18 |
| Tasks | 3 completed (API client, CalendarGrid + Dashboard wiring, human-verify checkpoint) |
| Files modified | 2 created, 1 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Room-type selector populated from real data | Pass | Confirmed live against a real seeded hotel |
| AC-2: Grid shows real availability and pricing | Pass | Spot-checked against deliberately-seeded prices (₱3,500/₱2,900), not placeholders |
| AC-3: Unseeded dates visually distinct | Pass | Distinct grey/italic state, never conflated with available |
| AC-4: Room-type/week switch re-fetches correctly | Pass | Including rapid-double-click race case — user-confirmed the grid settles on the correct week |
| AC-5: Zero-room-types empty state | Pass | Implemented with an explicit loading-vs-empty distinction (audit finding) |
| AC-6: Sold-out dates visually distinct | Pass | Deliberately-seeded sold-out date (2026-08-21) confirmed red/distinct live |

## Accomplishments

- First screen in the project showing real, live, database-backed availability and pricing to a human — not a static mock, not placeholder data.
- Enterprise audit caught three real, concrete bugs before any code was written: a browser-local-timezone dependency in "today" computation that would have silently misaligned with the backend's Manila-anchored date model on any machine not clocked to Asia/Manila; a classic stale-response race condition on rapid navigation clicks; and a missing-rate-cell case that would have crashed on `undefined.price` for a real, non-contrived data shape (a rate plan added after some dates were already seeded).
- Deliberately seeded a test hotel with both edge cases (a sold-out date, a missing-rate date) before handing the checkpoint to the user, so verification exercised the actual audit findings live rather than only the happy path — same discipline as 02-03/02-04's live-attack-style verification, applied here to UI correctness instead of security.
- Self-verified the real API response shape via curl through the dev proxy before the human checkpoint, confirming Task 1's types matched the live backend exactly, not an assumed shape.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `frontend/src/api/roomTypes.ts` | Created | Typed `fetchRoomTypes()`/`fetchCalendar()` wrapping `apiFetch`, matching the real backend response shapes field-for-field |
| `frontend/src/components/CalendarGrid.tsx` | Created | Presentational grid — 4-state cell model, PHP currency formatting via `Intl.NumberFormat` |
| `frontend/src/pages/Dashboard.tsx` | Modified | Replaced 02-04's placeholder with room-type selector, week navigation, staleness-guarded fetch orchestration |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| No design-taste skill applied | User explicitly deferred design polish to a later dedicated pass | Consistent plain-Tailwind styling across Login (02-04) and this grid; revisit together later, not piecemeal |
| Manila-anchored date computation mirrors `seed-inventory.ts` exactly | Backend's entire date model is Manila-anchored; browser-local-timezone dates would silently disagree | Audit-caught, closed before APPLY |
| AbortController-based staleness guard | Prevents an out-of-order response from an earlier request overwriting the grid after a newer request has fired | Audit-caught, closed before APPLY, live-tested via rapid double-click |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 (new) | — |

**Total impact:** None — plan executed as amended by the audit, no drift during implementation.

## Issues Encountered

None during implementation. All three audit-flagged risks (timezone, race condition, missing-rate-cell) were addressed at build time and confirmed live during the checkpoint using deliberately-constructed test data, rather than discovered afterward.

## Next Phase Readiness

**Ready:**
- A working, live-verified read view of real availability/pricing — 02-06 (booking form) can now be built as the write action layered directly on top of what staff already see
- `frontend/src/api/roomTypes.ts`'s typed client and the AbortController staleness-guard pattern are both directly reusable by 02-06
- The Manila-date helper pattern is now proven client-side and should be extracted to a shared location if 02-06 needs the same "today" computation (currently duplicated inline in Dashboard.tsx, acceptable at this scale per the project's simplicity-first discipline — revisit if a third consumer appears)

**Concerns (for user review, not blocking):**
- None new. Carried-forward items (CORS, 02-03's Assumptions 1-2) remain open, tracked in STATE.md.

**Blockers:**
- None.

**Phase 2 status:** 5 of an estimated 6 plans complete (auth API, calendar API, booking transaction, frontend scaffold+login, calendar grid UI). Walk-in booking form (02-06) remains — the last plan of Phase 2.

---
*Phase: 02-front-desk-booking-core, Plan: 05*
*Completed: 2026-08-18*
