---
phase: 04-channex-integration
plan: 01
subsystem: api
tags: [channex, webhook, ota, prisma, express, idempotency, concurrency]

requires:
  - phase: 02-front-desk-booking-core
    provides: the conditional-UPDATE-per-date transaction pattern (02-03) reused here for both increment and decrement
  - phase: 01-data-model-inventory-foundation
    provides: Booking.externalBookingId, BookingSource.OTA, ChannelMapping model — all anticipated this phase
provides:
  - POST /api/webhooks/channex — receives booking_new/modification/cancellation events, shared-secret authenticated
  - Hotel.channexPropertyId (unique) — links a hotel to its Channex property
  - Booking.channexBookingId (unique per hotel) — the stable per-reservation id, distinct from the per-event externalBookingId/revisionId
  - src/lib/channex.ts — Channex API client (pullBookingRevision, verifyWebhookSecret)
affects: [04-02-outgoing-ari-push, 04-03-sync-status-ui]

tech-stack:
  added: []
  patterns:
    - "Guarded conditional-UPDATE for inventory release, mirroring the existing guarded-increment pattern — prevents a raw DB CHECK-constraint violation from surfacing as an uncaught 500 under concurrent requests"
    - "Two distinct lookup keys for one external system's records: a per-event id (externalBookingId/revisionId) for retry idempotency, and a stable id (channexBookingId) for finding \"the current booking for this reservation\" across its lifecycle"

key-files:
  created:
    - src/lib/channex.ts
    - src/routes/channexWebhook.ts
    - prisma/migrations/20260819032751_add_hotel_channex_property_id/
    - prisma/migrations/20260819050721_add_hotel_channex_property_id_unique/
    - prisma/migrations/20260819052544_add_booking_channex_booking_id/
  modified:
    - prisma/schema.prisma
    - src/app.ts
    - .env.example

key-decisions:
  - "Channex's booking_id is stable across a reservation's lifecycle; revision_id is a new id per event — the plan's original design only captured revisionId, which would have silently broken every real cancellation/modification"
  - "staging.channex.io has no way to generate a genuine externally-delivered webhook without a real OTA channel connection — substituted a synthetic-revision test (real server/DB/transactions, only the Channex network hop stubbed) for the plan's live-checkpoint verification, user-approved"

patterns-established:
  - "When integrating an external system with both a stable entity id and a per-event/per-revision id, store and key on both separately — don't conflate them into one field"

duration: ~3h15min
started: 2026-08-19T03:27:51Z
completed: 2026-08-19T06:43:00Z
---

# Phase 4 Plan 01: Channex Incoming Webhook Handler Summary

**Built `POST /api/webhooks/channex` — a shared-secret-authenticated, idempotent, tenant-mapped webhook handler that turns Channex booking_new/modification/cancellation events into real Bookings using the same overbooking-safe transaction pattern as 02-03, and closed two real production-breaking bugs found via live adversarial security probing.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~3h15min |
| Started | 2026-08-19T03:27:51Z |
| Completed | 2026-08-19T06:43:00Z |
| Tasks | 3 (1 checkpoint:human-action, 1 auto x2 [schema+client, handler], 1 checkpoint:human-verify — substituted) |
| Files modified | 8 (3 new, 3 modified, 3 migrations — see Files Created/Modified) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Founder has real Channex staging credentials | Pass | staging.channex.io account, test property, API key; `.env` wired |
| AC-2: A hotel can be linked to its Channex property | Pass | `Hotel.channexPropertyId`, unique |
| AC-3: Authentic webhook creates a real booking, decrements inventory | Pass | Proven via synthetic-revision test (real server/DB/tx) + gsd-security-auditor live re-verification |
| AC-4: Inauthentic request rejected before any data touched | Pass | Live-tested: 401 before body/DB access, constant-time compare |
| AC-5: Retried webhook not double-processed | Pass | Live-tested sequential + 5x concurrent |
| AC-6: Modification/cancellation update the existing booking | Pass | **Was broken** (keyed on per-event revisionId) — found by gsd-security-auditor, fixed (keyed on stable channexBookingId instead), independently re-verified |
| AC-7: Unmapped room/rate fails loudly | Pass | 409, no partial processing |
| AC-8: Every path returns the correct status to Channex | Pass | Genuine errors still surface as 500 (verified via simulated Channex outage) |
| AC-9: Two concurrent retries never create two Bookings | Pass | 5 concurrent requests → exactly 1 Booking, live-verified under real Postgres race conditions |
| AC-10: Date-changed modification fully applied or fully rolled back | Pass | Cancel-old+create-new in one transaction; sold-out rollback leaves original booking untouched, live-verified |

All 10 ACs pass. AC-6 and a concurrency gap adjacent to AC-9/AC-10 were found broken during the security audit and fixed within this same APPLY — see Deviations.

## Accomplishments

- First working Channex integration in the project: a real (synthetic-revision-proven) OTA booking creates a real, correctly-mapped, inventory-decrementing Booking
- Found and fixed two real bugs that would have broken in production against genuine Channex traffic — both via live adversarial probing, neither caught by the enterprise plan audit or the initial 21/21-passing test suite
- Extended this project's established "conditional-UPDATE + affected-row-count guard" pattern (02-03) to inventory *release*, not just inventory *hold* — closing a concurrency gap the original design missed

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/channex.ts` | Created | Channex API client: `pullBookingRevision`, `verifyWebhookSecret` (constant-time) |
| `src/routes/channexWebhook.ts` | Created | `POST /` handler: auth → parse → hotel lookup → idempotency → pull revision → property_id cross-check → map rooms → per-event-type transaction |
| `prisma/schema.prisma` | Modified | `Hotel.channexPropertyId` (unique), `Booking.channexBookingId` (unique per hotel) |
| `src/app.ts` | Modified | Mounts `channexWebhookRouter` at `/api/webhooks/channex`, before the global body parser (own 256KB-scoped one) |
| `.env.example` | Modified | `CHANNEX_API_KEY`/`CHANNEX_BASE_URL`/`CHANNEX_WEBHOOK_SECRET` placeholders |
| `prisma/migrations/20260819032751_.../` | Created | Adds `Hotel.channexPropertyId` |
| `prisma/migrations/20260819050721_.../` | Created | Adds unique constraint on `channexPropertyId` (post-security-review) |
| `prisma/migrations/20260819052544_.../` | Created | Adds `Booking.channexBookingId` + unique constraint (post-security-audit fix) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Split externalBookingId (per-event) from channexBookingId (stable) | Audit found the original single-field design silently broke cancellation/modification against real Channex traffic, which issues a new revision_id per event | Both fields now exist; modification/cancellation lookups key on channexBookingId, booking_new idempotency stays on externalBookingId/revisionId |
| Substitute synthetic-revision test for the plan's live-checkpoint verification | staging.channex.io has no demo channel, manual booking API is Whitelabel-only (500s), and the Open Channel connector's Mapping UI has a persistent load bug confirmed unrelated to our code | Real server/DB/transaction proof obtained (21/21 checks) with only the Channex network hop stubbed; full live-Channex-delivered proof deferred to first real OTA channel onboarding |
| Add `Hotel.channexPropertyId` uniqueness + a `revision.property_id` cross-check | A manual security-review pass flagged theoretical cross-tenant webhook misrouting if two hotels ever shared a property id (not currently exploitable, but cheap to close correctly) | Prevents an entire class of future multi-tenant routing bugs at the DB level, not just documented intent |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 3 | Two were real production-breaking bugs found live; essential, not scope creep |
| Scope additions | 1 | Uniqueness hardening on channexPropertyId, cheap and directly relevant |
| Deferred | 1 (new) | Full live-Channex-delivered proof, blocked on an external platform limitation |

**Total impact:** Two genuine correctness bugs closed before this ever reached real traffic; no scope creep beyond the plan's own domain (webhook correctness).

### Auto-fixed Issues

**1. Critical: modification/cancellation matched bookings by the wrong (per-event) id**
- **Found during:** gsd-security-auditor's mandatory post-APPLY audit, live adversarial probing
- **Issue:** Per Channex's own documented behavior (this phase's own RESEARCH.md), a new `revision_id` is issued for every event; only `booking_id` is stable across a reservation's lifecycle. The handler matched existing bookings by `externalBookingId` (=revisionId), which would silently no-op every real modification/cancellation.
- **Fix:** Added `Booking.channexBookingId`, split the lookup — booking_new idempotency stays on the per-event id (confirmed correct), cancellation/modification now key on the stable id.
- **Files:** `prisma/schema.prisma`, `src/lib/channex.ts`, `src/routes/channexWebhook.ts`
- **Verification:** Reproduced the exact failure with a throwaway lifecycle test (distinct revision_id per event, same stable booking_id) — confirmed broken before, fixed after. Independently re-verified live by the auditor with its own fixtures.

**2. Critical: concurrent cancellation/modification retries manufactured 500s**
- **Found during:** Same audit, round 2 — the same concurrent-request technique that had already validated AC-9 for booking_new
- **Issue:** `decrementInventory` had no concurrency guard (unlike `incrementInventory`); concurrent retries raced and the loser hit the raw `DailyInventory_counts_check` CHECK constraint uncaught, surfacing as an unhandled 500 instead of an idempotent 200.
- **Fix:** Extended `decrementInventory` with the same conditional-UPDATE + affected-row-count guard `incrementInventory` already used; added a typed `ConcurrentReleaseError`, caught in both the cancellation transaction (which had no try/catch at all before) and the modification-replace path.
- **Files:** `src/routes/channexWebhook.ts`
- **Verification:** 5 concurrent requests per event type → all 200 (previously 1×200/4×500), correct final DB state confirmed directly. Independently re-verified live by the auditor, round 3.

**3. Medium (filtered, fixed anyway): no uniqueness on Hotel.channexPropertyId**
- **Found during:** Manual security-review pass (separate agent, before the security-auditor)
- **Issue:** No `@unique` constraint; a future collision between two hotels would silently misroute webhook data. Confidence-filtered to 3/10 (no current write path other than one throwaway seed script), but the fix was cheap and correct.
- **Fix:** Added `@unique` to `channexPropertyId`, plus a `revision.property_id` cross-check against the webhook's own claimed property_id.
- **Files:** `prisma/schema.prisma`, `src/routes/channexWebhook.ts`
- **Verification:** Regression + new-check test, both passed; no impact on existing flows.

### Deferred Items

- No real Channex-delivered webhook has ever exercised this handler — staging.channex.io has no demo/sandbox channel, its manual booking API is Whitelabel-only, and the one viable dashboard path (Open Channel connector) has a confirmed-unrelated-to-our-code bug in Channex's own Mapping UI. Re-verify against one genuine Channex-delivered webhook before onboarding the first real OTA channel (production go-live) — logged in STATE.md's Deferred Issues.
- Full concurrent-*multi-event*-ordering correctness (e.g. a modification and cancellation for the same booking arriving out of order) remains out of scope — same-event concurrency is now solved (this plan's fix), cross-event ordering is a v2 hardening item per the original plan audit's deferral, not blocking a low-volume pilot.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Dev server EPERM on `prisma generate` (query engine DLL locked) | Identified and stopped the process holding it, regenerated cleanly |
| `prisma migrate dev` refused non-interactive confirmation for the unique-constraint warning | Hand-wrote migration SQL matching this project's established convention, applied via `prisma migrate deploy` |
| Channex's manual booking-creation API 500s server-side | Confirmed via docs research it's Whitelabel-account-only; abandoned rather than keep guessing against their live staging service |
| Channex dashboard's Open Channel Mapping tab persistently failed to load | Confirmed via docs research this is a genuine platform gap for this connector type (no external listing catalog to map from), not fixable on our end; abandoned in favor of the synthetic-revision test |

## Next Phase Readiness

**Ready:**
- Incoming webhook handler is live, security-gated (14/14 threats closed, 3 independent audit rounds), and correctly handles the full booking lifecycle (new/modify/cancel) with real concurrency safety
- `ChannelMapping` pattern proven end-to-end for the first time
- The guarded-decrement pattern is now available for 04-02's outgoing ARI push if it needs similar inventory-release safety

**Concerns:**
- Nothing in this handler has been exercised by a genuine Channex-delivered event yet — the synthetic-revision test proves the logic, not the wire format Channex actually sends (though the JSON:API envelope shape was independently confirmed real via a live API call this session)
- RatePlan schema still doesn't distinguish hotel's base rate from marked-up OTA listing price — relevant to 04-02's ARI push, flagged as a pre-existing deferred item

**Blockers:** None — Phase 4 continues to 04-02 (outgoing ARI push) or 04-03 (sync status UI).

---
*Phase: 04-channex-integration, Plan: 01*
*Completed: 2026-08-19*
