# Enterprise Plan Audit Report

**Plan:** .paul/phases/01-data-model-foundation/01-02-PLAN.md
**Audited:** 2026-08-15
**Verdict:** Conditionally acceptable (must-have finding applied below; ready for APPLY as amended)

---

## 1. Executive Verdict

Conditionally acceptable as originally written, unconditionally acceptable as amended. The architectural correction made during planning (shared availability vs. per-rate-plan pricing) was the right call and already addressed the biggest structural risk before this audit even started. What remained was one release-blocking gap: the shared-count invariant this whole plan exists to establish was documented in prose and enforced only by future application code, not by the database itself.

Would I sign my name to shipping the original version? No — a documented invariant that only lives in a future phase's transaction logic is one bad deploy away from silently violating the project's #1 stated metric. Would I sign the amended version? Yes.

## 2. What Is Solid (Do Not Change)

- **The shared-inventory correction itself.** Separating `DailyInventory` (room-type-scoped count) from `RatePlanDailyRate` (rate-plan-scoped price/minStay) is the correct model, matches how real channel managers and Channex's own ARI actually work, and was caught before implementation rather than after. This is exactly the kind of catch a planning-stage review should find — good that it happened at this layer.
- **Deliberate exclusion of soft-delete on the two new grid tables**, with the reasoning stated inline (isClosed is the correct domain operation, not deletion). This is a case of correctly *not* applying 01-01's pattern where it doesn't fit, with the reasoning shown rather than left implicit.
- **The idempotency requirement carried forward consistently from 01-01** (AC-4, explicit skip-if-exists logic, verified by running the seed twice) — this plan holds itself to the same repeatability bar as the prior one instead of letting the standard slip on the second plan.

## 3. Enterprise Gaps Identified

1. **The core anti-overbooking invariant was documented, not enforced.** The plan correctly states that `DailyInventory` holds the shared `availableCount`/`bookedCount`/`heldCount`, but nothing in the schema prevents `bookedCount + heldCount` from exceeding `availableCount` except future, not-yet-written application code in Phase 2. For a system whose entire stated purpose is preventing overbookings, the database itself should refuse to hold an impossible state — relying solely on correct application logic in a later phase is exactly the kind of "audit trail weakness / state ambiguity" a real audit flags. This is cheap to add now, before any real booking data exists, and expensive to retrofit later (adding a CHECK constraint to a table that may already contain violating rows requires a data cleanup pass first).

2. **Verification could pass while hiding a real bug.** The original smoke-test plan verified "730 total rows across 2 rate plans" — an aggregate check that would still pass if the seed worker created an uneven split (e.g. 400 rows under one rate plan, 330 under the other) due to a bug in the per-rate-plan loop. Aggregate counts are a weaker verification than per-entity counts when multiple entities are involved.

3. **No test coverage for a normal real-world state: a RoomType with zero physical Rooms.** Phase 3's eventual admin UI will let a hotel admin create a RoomType before adding Rooms to it — a completely ordinary workflow order. The plan as written only tested the "3 rooms already exist" happy path, leaving the zero-rooms case unverified until it's discovered in production.

4. **Minor data-integrity gaps:** no lower bound on `minStay` (a value of 0 is nonsensical) and no positivity check on the new `basePrice` field.

5. **Currency left undocumented.** `price`/`basePrice` are untyped `Decimal` with no stated currency. For a PH-only v1 this is a reasonable simplification, but it should be a stated assumption, not silent — a future reader shouldn't have to infer it.

**Lower-severity, correctly deferred rather than ignored:**
- Keeping `availableCount` in sync when Rooms are added/removed/marked out-of-service *after* the 365-day grid is already seeded is genuinely out of this plan's scope (it belongs to Phase 3's room-management UI and Phase 6's housekeeping status work) — but it needed to be named explicitly as a deferred item with an owner, not left as an implicit gap someone might not notice until real hotel data exists.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Overbooking invariant documented but not enforced | Task 1 action, AC section, verification checklist | Added AC-5 requiring a database-level CHECK constraint (`bookedCount + heldCount <= availableCount`, all non-negative); Task 1 now specifies a second, constraint-only migration via `--create-only` with the raw SQL; verification checklist now requires confirming the constraint actually rejects an invalid write, not just that it was written into the migration file |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Aggregate-only verification could hide an uneven split bug | Task 2 action, verify step | Smoke test now checks each RatePlan's row count individually (365 each), not just a combined 730 total |
| 2 | No zero-Rooms test case | AC section (AC-6), Task 2 action | Added AC-6 and a second RoomType-with-zero-Rooms case to the smoke test |
| 3 | No lower/positivity bounds on minStay / basePrice | Task 1 action | Added `CHECK (minStay >= 1)` and `CHECK (basePrice > 0)` to the same constraint migration |
| 4 | Currency undocumented | Task 1 action | Added a requirement to comment both price fields as PHP-only in schema.prisma, tied to PROJECT.md's stated PH-only scope |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|------------------------|
| 1 | Keeping availableCount in sync with Room additions/removals/OOS after initial seeding | Genuinely belongs to Phase 3 (room management) and Phase 6 (housekeeping) — those phases don't exist yet. Named explicitly in the plan's boundaries and will be added to STATE.md's Deferred Issues so it has a tracked owner rather than being silently assumed away. |

## 5. Audit & Compliance Readiness

- **Silent failure prevention:** the CHECK constraint added above is the single most important change in this audit — it means an application-layer bug in Phase 2's booking transaction cannot silently oversell a room; the database itself becomes the last line of defense, not just correct code.
- **Audit evidence:** per-rate-plan verification (rather than aggregate) means a future incident investigation can trust that "the smoke test passed" actually proves both rate plans seeded correctly, not just that some total matched by coincidence.
- **Would this fail a real audit as originally written?** Yes, specifically on the missing database-level enforcement of the core business invariant — "we prevent overbooking" backed only by application code in a phase that doesn't exist yet is not something a real audit would accept for a system whose whole value proposition is exactly that guarantee.

## 6. Final Release Bar

**What must be true before this plan (as amended) ships:** the CHECK constraint must actually be verified live against the real database (attempt an invalid write, confirm rejection) — not just present in a migration file. Task 1's verify step now requires this explicitly.

**What risk remains if shipped as amended:** none release-blocking. The deferred item (availableCount sync on room changes) is correctly scoped to later phases and is now tracked, not silently missing.

**Sign-off:** yes, as amended.

---

**Summary:** Applied 1 must-have + 4 strongly-recommended upgrades. Deferred 1 item.
**Plan status:** Updated and ready for APPLY.

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
