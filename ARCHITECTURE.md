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
