---
phase: 04-channex-integration
plan: 02
status: complete
completed: 2026-08-23
---

# 04-02 Summary: RatePlan.otaPrice + Channex ARI push client

## Outcome

All 5 ACs satisfied. All 3 tasks done, live checkpoint approved by user against the real Channex staging dashboard. `npm run build` and `npm run smoke-test-booking-flow` both pass — no regression.

## What was built

- **`RatePlan.otaPrice`** — nullable `Decimal(10,2)`, independent from `basePrice`. DB CHECK constraint `RatePlan_otaPrice_check` (`otaPrice IS NULL OR otaPrice > 0`) enforces the real backstop, not just documented intent.
- **`pushAvailability` / `pushRestrictions`** in `src/lib/channex.ts` — thin POST wrappers around Channex's staging `/api/v1/availability` and `/api/v1/restrictions`. Both throw typed `ChannexApiError` on failure, including a 422 synthesized when Channex's response body carries `meta.warnings` on an otherwise-200 response (see gap below).

## AC verification

| AC | Result |
|----|--------|
| AC-1 (otaPrice independent from basePrice) | PASS — throwaway script confirmed both persist independently |
| AC-2 (pushAvailability updates real Channex data) | PASS — confirmed live on staging dashboard: Deluxe, 2026-09-03/09-04, AVL=2 |
| AC-3 (pushRestrictions uses otaPrice, not basePrice) | PASS — confirmed live on staging dashboard: Standard rate, 2026-09-03/09-04, rate=3,800 (otaPrice; basePrice=3,000 untouched) |
| AC-4 (fallback to basePrice when otaPrice null) | PASS — verified in throwaway script |
| AC-5 (push failure surfaces, never silent) | PASS — bogus room_type_id/rate_plan_id correctly throws `ChannexApiError`, after the fix below |

## Real gap found during execution (not anticipated by plan or audit)

Channex's staging API returns **HTTP 200 even when a per-item change fails validation** (e.g. an unmapped `room_type_id`/`rate_plan_id`) — the actual failure is only visible in the response body's `meta.warnings[]` array. Confirmed via direct curl against both `/api/v1/availability` and `/api/v1/restrictions` with bogus ids. Fixed by parsing the response body on every 200 and throwing `ChannexApiError(422, ...)` when `meta.warnings` is non-empty — treating a 200-with-warnings as success would have been exactly the silent-failure class this project's conventions forbid. This is the fourth plan in this project (after 02-01, 02-03, 04-01) where live testing against a real system caught something no prior review layer (plan, audit, or synthetic test) anticipated.

## Scope held

No automatic push wiring, no rate-limiting/batching, no admin UI for `otaPrice`, no background worker — all correctly deferred to 04-03/a future admin-UI plan, per the plan's boundaries.

## Files changed

- `prisma/schema.prisma` — `RatePlan.otaPrice` field + doc comments
- `prisma/migrations/20260824030220_add_rate_plan_ota_price/migration.sql` — column + CHECK constraint (hand-written, applied via `prisma migrate deploy`)
- `src/lib/channex.ts` — `pushAvailability`, `pushRestrictions`

## Next

Run `/paul:unify` housekeeping (ROADMAP.md plan count) — done as part of this close-out. 04-03 (change-tracking + background worker for automatic ARI push, respecting Channex's 10 req/min/property limit) and 04-04 (sync status UI) remain unplanned.
