---
phase: 04-channex-integration
plan: 04
subsystem: infra
tags: [background-worker, channex, postgres, setinterval]

requires:
  - phase: 04-02
    provides: pushAvailability/pushRestrictions push client
  - phase: 04-03
    provides: PushQueue table + enqueue wiring
provides:
  - Automatic, unattended ARI push — a real local change reaches Channex within one poll cycle, no script/human call
  - Genuine failure visibility (attempts, lastError, terminal FAILED state) instead of infinite silent retry
affects: [04-05 sync status UI — will surface PushQueue status/lastError to staff]

tech-stack:
  added: []
  patterns: ["atomic claim (check + claim in one UPDATE)", "fresh-read-at-push-time (never trust enqueue-time cached values)", "fixed-interval rate limiting (1 push/hotel/tick, no token bucket)"]

key-files:
  created: [src/lib/pushQueueWorker.ts]
  modified: [src/server.ts]

key-decisions:
  - "Worker started only from server.ts, never app.ts — protects every existing smoke-test/throwaway script from accidentally starting a real Channex-hitting interval"
  - "Availability value = minimum free count across the queued date range (conservative) — accepted simplification given no per-date OOS variance exists yet"
  - "Rate limiting = at most one push per hotel per 7s tick (60/7 ≈ 8.6/min, under Channex's 10/min/property cap) — no token bucket, no backoff/jitter"
  - "MAX_ATTEMPTS = 5 before a row terminates FAILED and stops being retried"

patterns-established:
  - "Atomic single-statement claim (UPDATE ... WHERE id = (SELECT ...) AND status = 'PENDING') prevents double-processing when a slow push overlaps the next tick"

duration: ~50min
completed: 2026-08-24T00:00:00Z
---

# Phase 4 Plan 04: PushQueue Background Worker Summary

**A 7-second polling worker that automatically pushes queued rate/availability changes to Channex — no script, no manual call — live-proven end to end against real Channex staging.**

## Performance

| Metric | Value |
|--------|-------|
| Tasks | 2 completed + 1 checkpoint approved |
| Files modified | 2 (1 new) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: PENDING RATE row processed with fresh value | Pass | 9/9 automated checks — row reached DONE, 0 attempts (succeeded first try) |
| AC-2: PENDING AVAILABILITY row processed with fresh value | Pass | Row reached DONE |
| AC-3: Genuine failure retries then terminates | Pass | attempts incremented each call, lastError populated, FAILED at exactly 5 attempts, never retried again |
| AC-4: Atomic claim, terminal states final | Pass | DONE and FAILED rows confirmed untouched by later ticks |
| AC-5: Automatic push, no manual call | Pass | Live checkpoint — PATCHed otaPrice to 4,250 via the real API, worker auto-pushed within ~5s, confirmed on Channex staging dashboard across the full visible date range |

## Accomplishments

- `src/lib/pushQueueWorker.ts`: atomic claim (`claimNextPending`), fresh-value computation (`computeRateValue`, `computeAvailabilityValue`), external-id resolution at push time (`resolveExternalIds`), and the retry/terminal-state logic (`processRow`) — all separately testable functions, not one monolithic tick
- `runPushQueueTick()` proven against the real 04-01 test hotel/mappings on Channex staging: real success path, real genuine-failure path (bogus mapping → Channex rejection → retry → FAILED)
- `startPushQueueWorker()` wired into `server.ts` only — verified by grep that `app.ts` has zero reference, and the existing `smoke-test-booking-flow` (which imports `app.ts` directly) still passes clean
- Live, unattended proof: a real `PATCH /api/rate-plans/:id` call (not a push-client call) resulted in the Channex dashboard showing the new rate within one poll cycle

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/pushQueueWorker.ts` | Created | Worker core: claim, compute-fresh, push, retry-to-FAILED, `startPushQueueWorker()` |
| `src/server.ts` | Modified | Calls `startPushQueueWorker()` after `app.listen(...)` |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Minimum-across-range for availability pushes | No per-date `availableCount` variance exists yet in this project (Room OOS/CRUD not wired to availability — existing Deferred Issue); minimum is the conservative, safe choice if that ever changes | Flagged in code comments; revisit only if OOS/per-date variance work happens |
| One push per hotel per 7s tick as the entire rate-limit mechanism | Simplest bound that's provably under Channex's 10 req/min/property limit without a token bucket | Sufficient for pilot-scale volume; would need real throttling logic if a hotel accumulates many queued rows and volume grows |
| 5 attempts before FAILED | Balances giving transient errors room to clear against not retrying a truly broken mapping forever | A FAILED row has no automated retry path yet — visible only via direct DB query until 04-05 surfaces it |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Throwaway-script cleanup-order bug (my own test script, not the worker) |
| Scope additions | 0 | — |
| Deferred | 0 new | — |

**Total impact:** None on shipped code — plan executed exactly as written.

### Auto-fixed Issues

**1. [Test-script bug] Cleanup order violated a FK constraint in the throwaway verification script**
- **Found during:** Task 2 verify, cleanup step
- **Issue:** `verify-push-queue-worker.ts`'s cleanup helper deleted `RoomType` rows before `DailyInventory` rows that referenced them, tripping `DailyInventory_roomTypeId_fkey`
- **Fix:** Reordered cleanup to delete `DailyInventory` before `RoomType`
- **Files:** `src/scripts/verify-push-queue-worker.ts` (deleted after use, not shipped)
- **Verification:** Re-ran script — 9/9 checks passed, clean teardown confirmed
- **Commit:** N/A — throwaway script never committed

### Deferred Items

None new. Existing Phase 4 deferred items unaffected.

## Issues Encountered

None in shipped code.

## Next Phase Readiness

**Ready:**
- Full outgoing ARI pipeline (schema → push client → queue → worker) is live and unattended — the phase's core goal ("outgoing rate/availability changes push out") is functionally complete
- `PushQueue.status`/`attempts`/`lastError` are the exact fields 04-05's sync status UI needs to surface

**Concerns:**
- A FAILED row has no human-visible surface yet — 04-05 needs to either show it in a UI or the ops team needs a way to query it directly in the meantime
- No admin action exists to manually retry a FAILED row — deferred to 04-05 or a dedicated future action

**Blockers:** None

---
*Phase: 04-channex-integration, Plan: 04*
*Completed: 2026-08-24*
