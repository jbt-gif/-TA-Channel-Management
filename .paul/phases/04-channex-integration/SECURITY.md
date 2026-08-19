# SECURITY.md — Phase 4 / Plan 04-01: Channex Incoming Webhook Handler

**Audited:** 2026-08-19 (round 1), 2026-08-19 (round 2 — independent re-audit of the booking_id fix), 2026-08-19 (round 3 — independent re-audit of the concurrent-decrement fix)
**Method:** Live adversarial probing against the running backend (`http://localhost:3000`), not static code review alone. A local HTTP stub stood in for `staging.channex.io` (real network hop only — real Express server, real Postgres, real Prisma transactions) since staging Channex currently has no way to generate a genuine externally-delivered webhook. Each round used a fresh, independently-written stub/fixture set (never the coordinator's own verification script or fixtures, never reused across rounds) to avoid rubber-stamping the coordinator's description of their fix. All test data created in every round was deleted; `.env`/`CHANNEX_BASE_URL` and the dev server were restored to their pre-audit state after each round; all throwaway scripts were deleted after use.

No formal `<threat_model>` block exists in `04-01-PLAN.md`; the plan's AC-3 through AC-10 (the security/integrity-relevant acceptance criteria) and 04-01-AUDIT.md's must-have/strongly-recommended findings serve as the threat register for this audit.

---

## Threat Verification

| ID | Threat / Requirement | Disposition | Verification | Result |
|----|----|----|----|----|
| AC-4 | Unauthenticated request rejected before DB access | mitigate | Live probe: no header → 401; wrong header (correct length) → 401; both byte-identical (24-byte body, same ETag) | **CLOSED** |
| AC-4 (constant-time compare) | Timing side-channel on secret comparison | mitigate | Code: `crypto.timingSafeEqual` after an equal-length guard (`src/lib/channex.ts:50-51`) | **CLOSED** — matches 02-01's precedent |
| AC-3 | Authentic webhook creates real Booking, decrements shared inventory via 02-03's conditional-UPDATE pattern | mitigate | Live probe: `booking_new` → 200, Booking row created (`status=CONFIRMED`, `source=OTA`), `DailyInventory.bookedCount` incremented exactly once per night | **CLOSED** |
| AC-5 | Retried webhook for same revision not double-processed | mitigate | Live probe: same event fired twice sequentially → 1 Booking row, inventory incremented once | **CLOSED** |
| AC-9 | Concurrent retries never create two Booking rows (DB-level backstop, not just app-level check) | mitigate | Live probe: 5 **truly concurrent** `booking_new` requests for one revision → exactly 1 Booking row, inventory incremented exactly once. Confirms `@@unique([hotelId, externalBookingId])` + P2002 catch works under real race conditions | **CLOSED** |
| AC-7 | Unmapped room/rate fails loudly, not silently | mitigate | Live probe: unmapped `room_type_id` → 409, zero DB rows written | **CLOSED** |
| AC-8 (positive) | Successfully/idempotently handled events return 200 | mitigate | Confirmed across AC-3/5/9 probes above | **CLOSED** |
| AC-8 (negative) | Genuine errors surface as 500, not swallowed to 200 | mitigate | Live probe: Channex API stub returning 503 → handler returns 500, not 200 | **CLOSED** |
| Cross-tenant/property mismatch (revision.property_id cross-check) | Webhook's claimed `property_id` used to route without confirming against the pulled revision's own `property_id` | mitigate | Live probe: revision pulled from Channex whose `property_id` differs from the webhook payload's claimed `property_id` → 422, zero DB rows written. `Hotel.channexPropertyId` confirmed `@unique` in schema | **CLOSED** |
| Malformed/incomplete Channex API response | Crash or silent bad-data acceptance on malformed revision | mitigate | Live probe: revision with empty `rooms[]` → 422 typed error, zero DB rows written | **CLOSED** |
| Oversized request body on internet-facing endpoint | No size cap invites cheap DoS | mitigate | Live probe: 300KB body → 413, rejected before reaching handler logic | **CLOSED** |
| AC-1 / AC-2 | Staging credentials exist; Hotel↔Channex property link | structural | `.env` contains real credentials; `Hotel.channexPropertyId` present and `@unique` | **CLOSED** |
| **AC-6 / AC-10** (round 1 finding) | `booking_modification`/`booking_cancellation` couldn't find their target booking against genuine (distinct-per-event) Channex `revision_id`s | mitigate | **RE-VERIFIED LIVE, round 2, independent stub/fixtures.** Coordinator added `Booking.channexBookingId` (stable, `@unique([hotelId, channexBookingId])`), captured `booking_id` on the pulled revision, and re-keyed the modification/cancellation lookup on `channexBookingId` instead of `externalBookingId`. Live probe: `booking_new` (revision A, booking_id X) → `booking_cancellation` with a **distinct** revision B, same booking_id X → booking correctly flips to `CANCELLED`, inventory correctly released on both nights (verified on a never-before-touched date range to rule out contamination). Live probe: `booking_new` (revision C) → `booking_modification` with a distinct revision D, same booking_id, **different dates** → old booking correctly cancelled+superseded, new replacement booking correctly `CONFIRMED` on new dates, inventory released on old dates and taken on new dates, amount updated. **Root cause is fixed and independently confirmed.** | **CLOSED** |
| **AC-9 (cancellation/modification variant)** (round 2 finding) | Concurrent retries of the same `booking_cancellation`/`booking_modification` event 500 for every request but one instead of no-op'ing to 200 (`decrementInventory` had no conditional guard, unlike `incrementInventory`; losers hit an uncaught Postgres CHECK-constraint violation, code `23514`) | mitigate | **RE-VERIFIED LIVE, round 3, independent stub/fixtures.** Coordinator extended `decrementInventory` with the same conditional-UPDATE pattern already used by `incrementInventory` (`AND "bookedCount" - quantity >= 0`, checked affected-row-count), added a typed `ConcurrentReleaseError`, and caught it in both the cancellation transaction (previously had no try/catch at all) and the modification-replace transaction (alongside the existing P2002/SoldOutError handling). Live probe: 5 truly concurrent `booking_cancellation` requests for the same event → **all 5 return 200** (previously 1×200/4×500); server log shows 1 `cancelled` + 4 `cancel-race-no-op`. Live probe: 5 truly concurrent `booking_modification` (date-change) requests for the same event → **all 5 return 200**; server log shows 1 `modified-replaced` + 4 `modification-race-no-op`. DB verified directly after each race: cancellation left exactly 1 booking `CANCELLED` with inventory at `booked=0` on both nights (not negative, not still-booked); modification left exactly 2 bookings (old superseded/cancelled, new `CONFIRMED`) with old dates released and new dates booked exactly once (not 5×). **Fix is correct and independently confirmed under real concurrency, not just by re-reading the code.** | **CLOSED** |

## Informational — Not Blocking, Pre-Existing/App-Wide

| Finding | Detail |
|---|---|
| Body-parser errors bypass the secret check | `channexWebhookRouter.post("/", express.json({limit:"256kb"}), handler)` runs the JSON body parser **before** `verifyWebhookSecret()`. A request with no auth header but syntactically invalid JSON gets a 400 with a leaked stack trace (absolute file paths) instead of a clean 401. Reproduces identically on the pre-existing `/api/bookings` route — `NODE_ENV` is unset app-wide, not a regression from this plan. Worth an app-level fix, not scoped to this plan's files. |
| Length-revealing early-return in `verifyWebhookSecret` | Byte-length mismatch is O(1) vs. O(n) for a length-match-but-content-mismatch — theoretical timing leak of secret length. Standard accepted pattern (matches this project's 02-01 precedent); not treated as exploitable. |

## Unregistered Flags

None — no SUMMARY.md `## Threat Flags` section exists for this plan yet.

---

## Verdict

**Closed:** 14/14 tracked items — all structural + live-verified, including both critical findings, each independently re-confirmed fixed under live adversarial re-probing (not by trusting the coordinator's description).
**Open:** 0

**PASS.** This closes 04-01's security gate.

Two critical findings surfaced during this audit, both discovered by live adversarial probing rather than static review, and both independently re-verified live after the fix (fresh stub/fixtures each round, never reusing the coordinator's own verification script or test data):

1. **Round 1:** `booking_modification`/`booking_cancellation` keyed their existing-booking lookup on the per-event `revision_id` instead of Channex's stable `booking_id`, so real-world (distinct-revision-per-event) cancellations/modifications would silently no-op forever. Fixed by adding `Booking.channexBookingId` and re-keying the lookup. Re-verified live in round 2 with the exact repro sequence (distinct revision per event, same stable booking_id) for both cancellation and modification-with-date-change — both now work correctly.
2. **Round 2:** concurrent retries of the same `booking_cancellation`/`booking_modification` event manufactured 500s for every request but one (an uncaught Postgres CHECK-constraint violation on unguarded inventory decrement), instead of no-op'ing to 200 — data stayed safe but availability/idempotency was broken, which matters given Channex's documented retry-on-5xx behavior. Fixed by extending `decrementInventory` with the same conditional-UPDATE guard `incrementInventory` already used, plus a typed `ConcurrentReleaseError` caught in both event paths. Re-verified live in round 3: 5 truly concurrent requests for each event type now all return 200, with DB state confirmed correct (exactly one winner, no negative/double counts) in both cases.

Everything else verified in round 1 remains solid: the auth boundary, constant-time secret comparison, the booking_new create path under real concurrency (AC-9's original scope), unmapped-resource handling, cross-tenant property_id cross-check, malformed-revision handling, the size cap, and genuine-error-surfaces-as-500 (AC-8 negative). Two informational, non-blocking, pre-existing/app-wide items remain noted below (not scoped to this plan's files, not release-blocking for this phase).

SECURITY.md: `.paul/phases/04-channex-integration/SECURITY.md`
