# ARCHITECTURE.md

Living doc, updated as a close-out step after each day's work. Additions, not a rewrite — see git history if something below goes stale.

## Stack

- **Backend:** Node / Express / TypeScript (ESM) / Prisma
- **DB:** Supabase Postgres (free-tier dev project, ref `cqdglpgqoflzpibvclbs`), accessed **only via Prisma over a direct Postgres connection** — no Supabase client SDK, no PostgREST, no RLS in play. See "DB access model" below, this matters for how the SOP's Supabase-grants checklist item applies here.
- **Connection:** This dev machine has no outbound IPv6, so the app uses Supabase's Transaction pooler (`DATABASE_URL`, port 6543, `?pgbouncer=true`) at runtime and the Session pooler (`DIRECT_URL`, port 5432) only for `prisma migrate`, instead of the paid IPv4 direct-connection add-on.
- **Deployment target:** Railway/Render (not yet deployed — backend-only, no prod environment exists yet).
- **Framework:** Built via PAUL (`.paul/` — PROJECT.md, ROADMAP.md, STATE.md, config.md, SPECIAL-FLOWS.md, per-phase PLAN/AUDIT/SUMMARY docs). PAUL's own docs are the source of truth for decisions/rationale; this file is the code-facing summary.

## DB access model (read before adding any Supabase-client code)

Every table is reached exclusively through Prisma, connected as the `postgres` role via connection pooler. There is **no RLS policy and no table-level grant configured anywhere** in the migrations — and none is needed *as long as this access pattern holds*, because nothing ever talks to Supabase's PostgREST/REST API or the `anon`/`authenticated` Postgres roles.

**Gotcha for future-Claude:** if a later phase ever adds a browser-side Supabase client (e.g. for realtime subscriptions, or a quick admin panel using `supabase-js` directly instead of going through the Express API), that code path would hit tables with **zero RLS and zero grants** — wide open. Before any direct-from-browser Supabase usage is added, RLS must be enabled and `authenticated`/`service_role` grants configured (per app-build-sop.md's Supabase grants pattern) — don't assume "we already handle auth in Prisma" covers a new access path that bypasses Prisma entirely.

## Data model (Phase 1, complete — 2026-08-15)

12 Prisma models, all multi-tenant via `hotelId`:

- **Hotel** — tenant root.
- **User** — `email` (unique, should be stored lowercase-normalized once auth lands), `passwordHash`, `role` (SUPER_ADMIN/HOTEL_ADMIN/FRONT_DESK/HOUSEKEEPING). One staff account = one hotel.
- **RoomType**, **RatePlan**, **Room** — RatePlan is its own entity, not just a RoomType attribute.
- **DailyInventory** — availability, **shared per `[roomTypeId, date]`**, not per rate plan. This was a deliberate correction during Phase 1: the original design keyed inventory by `[roomTypeId, ratePlanId, date]`, which would have let the same physical rooms be independently oversold across different rate plans. `bookedCount + heldCount <= availableCount` is enforced by a **DB-level CHECK constraint** — the real overbooking backstop, not just app-level logic.
- **RatePlanDailyRate** — price + minStay, per `[ratePlanId, date]`. Separate from DailyInventory on purpose (price varies per rate plan, availability doesn't).
- **Guest**, **Booking**, **BookingItem**, **Payment**, **ChannelMapping**.
- **Booking/Payment have no `deletedAt`** — deliberately never soft- or hard-deleted. Cancellation/failure are statuses, not deletions; needed for reconciliation and dispute resolution.
- **BookingItem.totalPriceSnapshot** is a full-stay computed total, not a flat per-night rate × nights — caught during Phase 1's audit, because RatePlanDailyRate is per-date and a flat figure would silently misstate cost whenever nightly rates vary across a stay.
- Standing pattern for every model, present from Phase 1 onward: `cuid()` ids (not sequential/guessable), `onDelete: Restrict` on every tenant FK, soft-delete via `deletedAt` on non-financial models only.

All 12 models are migrated and smoke-tested against the real Supabase dev DB (`npm run smoke-test`, `smoke-test-inventory`, `smoke-test-booking`).

## Auth (Phase 2, Plan 02-01 — PLANNED AND AUDITED ONLY, NO CODE YET)

**As of 2026-08-15, none of this exists as code.** `.paul/phases/02-front-desk-booking-core/02-01-PLAN.md` and `02-01-AUDIT.md` describe the intended design below, but `src/lib/auth.ts`, `src/middleware/auth.ts`, `src/routes/auth.ts`, and `src/scripts/create-user.ts` do not exist on disk, and `package.json` has no `bcryptjs`/`jose`/`express-rate-limit` dependency yet. `src/server.ts` is still just a bare `/health` route. Do not treat the design below as shipped — it's a plan, paused deliberately before APPLY because it's the first plan touching real credentials/JWT secrets.

Planned design (once applied):
- JWT (stateless, HS256 via `jose`), 12-hour expiry, no refresh flow — staff re-authenticate daily.
- **Accepted risk, on record:** stateless JWT means no instant revocation before natural expiry — a stolen terminal or same-day-terminated employee keeps a working token for up to 12h. Deliberate tradeoff for simplicity, not an oversight. Revisit if a real incident occurs or once multiple hotels are live.
- Login endpoint: generic 401 for both wrong-password and nonexistent-email (no user enumeration), rate-limited (5/15min/IP via `express-rate-limit`, in-memory — fine for single-instance deployment, revisit only if horizontally scaled).
- `JWT_SECRET` must be ≥32 chars, checked at startup with `process.exit(1)` if missing/weak — no silent fallback secret.
- Staff accounts created via an admin-run CLI script only (`create-user.ts`) — no self-service signup, matches white-glove onboarding.
- `GET /api/me` planned as permanent API surface (current-session lookup for the future frontend), not throwaway test scaffolding.

## Known gotchas / decisions log

| Date | What | Why it matters |
|------|------|-----------------|
| 2026-08-15 | DailyInventory redesigned mid-Phase-1 from per-rate-plan to per-room-type sharing | Prevents cross-rate-plan overselling of the same physical rooms — this is the core anti-overbooking invariant the whole product's value prop depends on |
| 2026-08-15 | BookingItem price field renamed/redefined from flat per-night to full-stay total | Rate model is per-date (RatePlanDailyRate); a flat figure would silently misstate totals once rates vary within a stay |
| 2026-08-15 | Booking/Payment never soft- or hard-deleted | Financial audit trail requirement — status changes only |
| 2026-08-15 | No RLS/table grants exist anywhere — safe today only because all DB access goes through Prisma, never through Supabase's REST API | Add RLS + grants *before* any browser-side Supabase client is introduced, per app-build-sop.md's grants pattern |
| 2026-08-15 | JWT chosen over server-side sessions for front-desk auth (planned, not yet built) | Simplicity, no Session table — accepted tradeoff is no instant token revocation before 12h expiry |
| 2026-08-15 | Git repo initialized this session; first commit's author identity is the placeholder `Your Name <you@example.com>` (git `user.name`/`user.email` never configured on this machine) | Cosmetic today, but every future commit will carry the same wrong attribution until `git config user.name`/`user.email` are set — fix before it's load-bearing (e.g. before inviting a collaborator or needing accurate blame history) |

## Deferred (tracked, not forgotten)

- Written service agreement for hotel clients — before first paying hotel goes live with real money.
- Whether the current Supabase dev project becomes the eventual staging environment, or a separate one is created — Phase 7 (pre-launch gate) decision.
- Keeping `DailyInventory.availableCount` in sync with Room add/remove/OOS changes — owned by Phase 3 (room mgmt UI) and Phase 6 (housekeeping).
- CORS, distributed rate-limit store, persistent auth audit-log table — all explicitly deferred in 02-01's plan/audit, not oversights.

## Channex webhook handler (Phase 4, Plan 04-01 — 2026-08-19, committed `38776bc`)

`POST /api/webhooks/channex` (`src/routes/channexWebhook.ts`, mounted in `app.ts` **before** the global `express.json()` so it gets its own 256kb-limited body parser — internet-facing, shared-secret auth not JWT). Handles `booking_new`/`booking_modification`/`booking_cancellation`; other event types 200-no-op. Webhooks are thin (id-only) per Channex's own design — handler always does a follow-up `GET /api/v1/booking_revisions/:id` pull (`src/lib/channex.ts`) before acting.

**Two ID types, do not conflate:** Channex hands out a new `revision_id` per event but keeps `booking_id` stable across a reservation's whole lifecycle. `Booking.externalBookingId` stores the per-event `revision_id` (used only for `booking_new` retry dedup). `Booking.channexBookingId` stores the stable `booking_id` (the only correct key for finding "the existing booking" on modification/cancellation — `@unique([hotelId, channexBookingId])`). Both fields nullable, Postgres allows multiple NULLs in a unique index so pre-Channex walk-in bookings are unaffected. This distinction was originally missed and shipped keyed on `revision_id` for all three event types — would have silently no-op'd every real cancellation/modification. Caught by `gsd-security-auditor`'s live adversarial probing, not the enterprise plan audit or the 21/21 synthetic test suite (that suite reused one `revision_id` across a whole reservation lifecycle instead of modeling Channex's real per-event-id behavior).

**`decrementInventory` needed the same conditional-UPDATE race guard as `incrementInventory`, and initially didn't have it** — concurrent cancellation/modification retries (Channex's documented retry-on-5xx behavior) raced the raw `DailyInventory_counts_check` CHECK constraint into an uncaught 500 instead of an idempotent 200. Fixed by mirroring the guard (`AND "bookedCount" - quantity >= 0`, checked affected-row-count, typed `ConcurrentReleaseError` caught at both call sites).

**Amount-only modification path overwrites `Booking.totalAmount` in place, no history kept** (`if (unchanged) { ...update totalAmount... }` in `channexWebhook.ts`) — an OTA rate-change webhook silently loses the old total, no old→new record. Not flagged by the security audit (that pass scoped to correctness/race conditions, not financial audit trail). Low urgency today (no real money moving through this system yet — pre-sales, Channex staging only) but flag before this handler processes a real OTA booking; SOP requires an audit trail on financial-value changes.

**Unmapped-property / unmapped-room-or-rate failures are logged only via `console.log` JSON lines** — no Sentry, no alert channel, nothing wired yet (matches the project-wide "no monitoring yet" gap, expected at this pre-launch stage per ROADMAP.md's Phase 7 gate). Concretely: if a hotel's `channexPropertyId` mapping is wrong or missing, every webhook for that property returns 200 (so Channex doesn't retry) while silently doing nothing — genuinely invisible unless someone is tailing server stdout live. Wire real alerting before onboarding the first live OTA channel, not just before "real users" broadly.

**Deferred, tracked in STATE.md:** no genuine Channex-delivered webhook has ever exercised this handler yet — staging.channex.io has no working demo/sandbox channel path (manual API is Whitelabel-only, Open Channel connector's Mapping UI has a confirmed Channex-side dashboard bug). AC-3/5/6/7/9/10 were proven with a synthetic-revision test instead (real server/DB/transactions, only the Channex network hop stubbed). Re-verify against one genuine externally-delivered webhook before onboarding the first real OTA channel.

New env vars (`.env.example`, no real values committed): `CHANNEX_API_KEY`, `CHANNEX_BASE_URL`, `CHANNEX_WEBHOOK_SECRET` (self-invented shared secret — Channex has no built-in webhook signing). All on the founder's single central Channex account per the existing "hotels never see Channex directly" design (`PROJECT.md`), not a personal/unrelated account.

**04-02 (RatePlan.otaPrice + ARI push client) — applied 2026-08-23, committed `4ad5e85`.** `RatePlan.otaPrice` (nullable Decimal, `CHECK (otaPrice IS NULL OR otaPrice > 0)`) is a separate independent field, not a computed `basePrice × markup%` — the agency's margin lever. `pushAvailability`/`pushRestrictions` in `src/lib/channex.ts` call Channex's `/api/v1/availability` and `/api/v1/restrictions` (10 req/min/property each, per RESEARCH.md).

**Gotcha found live against real Channex staging, not anticipated by any plan/audit:** Channex returns **HTTP 200 even when a per-item push is rejected** (e.g. unmapped `room_type_id`/`rate_plan_id`) — the actual failure only appears in the response body's `meta.warnings[]`. Both push functions parse `meta.warnings` on every 200 and throw `ChannexApiError(422, ...)` if present. **Any future Channex endpoint added to `channex.ts` must repeat this warnings-check — a bare "status was 2xx" check is not sufficient for this API.**

## Outgoing ARI pipeline (Phase 4, Plans 04-02→04-04 — complete and committed, `4ad5e85`/`32325bb`/`21a7f35`)

Full local-change → Channex push pipeline, proven fully unattended against real Channex staging (a real API-triggered rate PATCH reached the staging dashboard with zero manual push-client call):

1. **Trigger points** — `ratePlans.ts` PATCH (otaPrice/basePrice change) and `bookings.ts` POST (walk-in booking, availability change). Each does its real DB write first, commits, **then** enqueues a `PushQueue` row in a separate try/catch that only `console.error`s on failure — a queue-insert failure never rolls back or fails the request that already succeeded. Enqueue is skipped entirely (no row, no error) if the hotel has no `channexPropertyId` or no matching `ChannelMapping` — by design, not a bug.
2. **`PushQueue` table** (`prisma/schema.prisma`, migration `20260824033820_add_push_queue`) — stores `type` (RATE/AVAILABILITY), `roomTypeId`/`ratePlanId`, a `dateFrom`/`dateTo` **range** (not a value snapshot — deliberate, avoids staleness if multiple local changes land before the worker runs), `status` (PENDING/PROCESSING/DONE/FAILED), `attempts`, `lastError`. No GRANT statements in the migration — consistent with this project's established Prisma-direct-to-Postgres exception (see "DB access model" above), not an oversight.
3. **`src/lib/pushQueueWorker.ts`** — polls every 7s (`60/7 ≈ 8.6 ticks/min`, under Channex's 10/min/property cap), claims **at most one PENDING row per hotel per tick** via a single atomic `UPDATE ... WHERE id = (SELECT ... FOR UPDATE-equivalent) AND status = 'PENDING'` (same conditional-UPDATE-as-lock pattern as 02-03/04-01's inventory guards) so overlapping ticks can't double-process. Recomputes the actual value fresh at push time (`RatePlan.otaPrice ?? basePrice`; `MIN(availableCount - bookedCount - heldCount)` across the row's date range) — never trusts anything cached at enqueue time. Failures retry up to `MAX_ATTEMPTS = 5`, then terminate `FAILED` with `lastError` recorded (never retries forever, never fails silently). Started only from `server.ts` (`startPushQueueWorker()`), never `app.ts`, so no test/script accidentally starts it.

**Known gap, not yet fixed:** if the `PushQueue.create()` insert itself fails (DB hiccup, connection drop) in the narrow window right after the real mutation already committed, there is **no row at all** to retry — not even a `FAILED` one. It's invisible in `console.error` only, and (once 04-05 ships) invisible on the sync-status dashboard too, since that page only surfaces existing `PushQueue` rows. Narrow window, but a real silent-failure path per app-build-sop.md's checklist — worth a reconciliation job (compare `RatePlan.otaPrice`/recent bookings against `PushQueue` history) before scaling past a single pilot hotel, not blocking today.

**04-05 (sync status API + dashboard badge + manual retry) — PLANNED AND AUDITED ONLY, NO CODE YET** (`.paul/phases/04-channex-integration/04-05-PLAN.md`, `04-05-AUDIT.md`, both currently untracked in git). `src/routes/syncStatus.ts` does not exist on disk. The audit already caught and fixed two real gaps in the plan before any code was written: (1) the original plan would have nulled `PushQueue.lastError` on retry, destroying the only failure evidence at the exact moment a human intervenes; (2) the retry endpoint had no accountability trail and no abuse guard, which could have let someone loop-reset the worker's `MAX_ATTEMPTS` circuit breaker and hammer Channex's rate-limited (eventually paid) API indefinitely. Fixes are written into the plan (`PushQueue.retriedByUserId`/`lastRetriedAt` fields, 60s retry cooldown, resolved `roomTypeName`/`ratePlanName` instead of raw ids) but **none of it is migrated, built, or applied** — resume by approving 04-05-PLAN.md for APPLY.
