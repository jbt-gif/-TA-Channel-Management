---
phase: 01-data-model-foundation
plan: 01
subsystem: database
tags: [prisma, postgresql, supabase, multi-tenant, express, typescript]

requires: []
provides:
  - Backend project scaffold (Node/Express/TypeScript/ESM) with a working health-check endpoint
  - Core Prisma schema: Hotel, User (+Role), RoomType, RatePlan, Room (+HousekeepingStatus)
  - Multi-tenant isolation pattern (hotelId on every hotel-owned table, including RatePlan denormalized)
  - Live migration applied against the real Supabase dev database
  - Idempotent smoke-test script proving the schema works with real data, not just defined
affects: [01-02-daily-inventory-seed, 01-03-guest-booking-payment, phase-02-front-desk-booking-core]

tech-stack:
  added: [express, "@prisma/client", prisma, typescript, tsx]
  patterns:
    - "Multi-tenant isolation via explicit non-nullable hotelId on every hotel-owned table"
    - "cuid() ids everywhere, not auto-increment integers, to avoid enumerable resources"
    - "onDelete: Restrict on every tenant-scoping foreign key, no silent cascades"
    - "Soft-delete via nullable deletedAt, not hard delete"
    - "Prisma via Supabase poolers: DATABASE_URL (transaction pooler, ?pgbouncer=true) for runtime, DIRECT_URL (session pooler) for migrations"

key-files:
  created:
    - prisma/schema.prisma
    - src/server.ts
    - src/lib/prisma.ts
    - src/scripts/smoke-test.ts
    - package.json
    - tsconfig.json
    - .env.example
  modified: []

key-decisions:
  - "IDs use cuid(), not auto-increment — avoids enumerable resource IDs once API routes exist"
  - "RatePlan carries a denormalized hotelId directly, not just reachable via RoomType join — closes a tenant-isolation gap class before Phase 2 builds queries"
  - "Every hotel-owned table gets deletedAt for soft-delete, no hard-delete path by default"
  - "Direct connection avoided entirely (this machine has no outbound IPv6); Transaction pooler + Session pooler used instead, both free-tier, no paid IPv4 add-on needed"

patterns-established:
  - "Every future model touching hotel-scoped data must carry hotelId + onDelete: Restrict + deletedAt, matching this phase's pattern"
  - "Every plan's verify step must run against the real dev database, never assumed"

duration: "~1 session"
started: "2026-08-15"
completed: "2026-08-15"
---

# Phase 1 Plan 01: Data Model Foundation Summary

**Backend project scaffolded and core multi-tenant Prisma schema (Hotel, User, RoomType, RatePlan, Room) migrated and verified against a real Supabase Postgres dev database.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1 session |
| Started | 2026-08-15 |
| Completed | 2026-08-15 |
| Tasks | 3 completed (1 scaffold, 1 checkpoint, 1 schema+migration) |
| Files modified | 8 created |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Backend project boots | Pass | `npm install`/`build`/`dev` all succeeded; `/health` returned `{"status":"ok"}` |
| AC-2: Schema migrates against real dev database | Pass | `npx prisma migrate dev` applied cleanly against the live Supabase project, not a mock |
| AC-3: Schema is structurally correct | Pass | All 5 models created with cuid ids, hotelId present everywhere including RatePlan, invalid enum insert confirmed rejected by the database |
| AC-4 (audit-added): Smoke test is repeatable | Pass | Ran twice consecutively, both succeeded with no unique-constraint failures |

## Accomplishments

- Real, working backend project — not a plan, actual code that builds and runs
- Multi-tenant isolation pattern established at the schema level from day one, including the RatePlan denormalization the audit caught
- First real proof the Supabase dev database setup (poolers, IPv4 workaround, pgbouncer param) actually works end-to-end

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `package.json` | Created | Node/Express/TS/ESM project definition, scripts for dev/build/smoke-test |
| `tsconfig.json` | Created | Strict TS config, ES2022/NodeNext |
| `.env.example` | Created | Template for DATABASE_URL/DIRECT_URL/PORT |
| `.env` | Created (by user) | Real Supabase credentials, gitignored |
| `.gitignore` | Created | Excludes node_modules, dist, .env |
| `src/server.ts` | Created | Express app with `/health` endpoint |
| `src/lib/prisma.ts` | Created | Singleton PrismaClient instance |
| `prisma/schema.prisma` | Created | Hotel, User, RoomType, RatePlan, Room + Role/HousekeepingStatus enums |
| `src/scripts/smoke-test.ts` | Created | Idempotent real-data verification script |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Use Session pooler + Transaction pooler instead of Direct connection | This machine has no outbound IPv6, and Direct connection requires it (or a paid IPv4 add-on) | Both poolers work over IPv4, free tier, no add-on cost |
| Denormalize hotelId onto RatePlan | Audit finding — avoids requiring a join through RoomType to enforce tenant isolation on every future query | Closes a class of potential tenant-data-leak bugs before Phase 2 builds on it |
| cuid() ids instead of auto-increment | Audit finding — sequential IDs are enumerable once API routes exist | More secure by default, avoids a painful later migration |
| onDelete: Restrict on all tenant FKs | Audit finding — undefined cascade behavior could silently wipe a hotel's entire dataset | An accidental Hotel/RoomType delete now fails loudly instead of cascading silently |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Essential fix, no scope creep |
| Scope additions | 0 | — |
| Deferred | 0 (new) | — |

**Total impact:** One real credential-formatting mistake caught and fixed at the checkpoint; otherwise plan executed as written (as amended by the audit).

### Auto-fixed Issues

**1. [Config] Missing `?pgbouncer=true` on pasted DATABASE_URL**
- **Found during:** Checkpoint verification (Task 2)
- **Issue:** User's pasted Transaction pooler connection string was missing the required `pgbouncer=true` query parameter
- **Fix:** Appended `?pgbouncer=true` to the DATABASE_URL value in `.env`
- **Files:** `.env`
- **Verification:** Confirmed present before proceeding to migration; migration and smoke test both succeeded afterward

### Deferred Items

None new — see STATE.md Deferred Issues for pre-existing items (service agreement, super-admin view, staging-vs-dev database decision) carried from prior discussion.

## Issues Encountered

None beyond the auto-fixed pgbouncer parameter above.

## Skill Audit

No specialized flows required for this plan (per SPECIAL-FLOWS.md — `security-review`/`gsd-security-auditor` are scoped to the payment, webhook, and query-level tenant-isolation-enforcement phases, none of which this plan touches). Skill audit: N/A — none required. ✓

## Next Phase Readiness

**Ready:**
- Core schema (Hotel, User, RoomType, RatePlan, Room) exists, is migrated, and is proven with real data
- Multi-tenant isolation pattern (hotelId, onDelete:Restrict, soft-delete) is established and should be followed by every later model
- Dev database connection (both poolers, pgbouncer param) is proven working — no further Supabase setup friction expected

**Concerns:**
- None blocking. Note carried forward: whether this Supabase project becomes the eventual Phase 7 staging environment, or stays a separate throwaway dev DB, is still an open decision (not needed until Phase 7).

**Blockers:**
- None.

**Phase 1 status:** 1 of 3 plans complete. Plan 01-02 (DailyInventory schema + 365-day seed worker) and Plan 01-03 (Guest/Booking/BookingItem/Payment/ChannelMapping + multi-tenant scoping enforcement) are still to come before Phase 1 itself is done.

---
*Phase: 01-data-model-foundation, Plan: 01*
*Completed: 2026-08-15*
