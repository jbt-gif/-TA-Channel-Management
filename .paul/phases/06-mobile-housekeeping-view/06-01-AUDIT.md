# Enterprise Plan Audit Report

**Plan:** .paul/phases/06-mobile-housekeeping-view/06-01-PLAN.md
**Audited:** 2026-08-27
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Conditionally acceptable, amended. The plan's tenant-isolation and role-gating design is correct and consistent with every prior phase's proven pattern (identical 404 on cross-tenant, role check before DB call, try/catch scoped around the whole ownership-check-through-response block). One release-blocking gap: zero accountability trail on the only mutation this plan introduces. Fixed below. I would sign off on the amended version; I would not have signed off on the original.

## 2. What Is Solid

- **Tenant isolation, both directions.** GET filters by `hotelId` at the query level (not post-filtered in memory); PATCH's ownership `findFirst` uses the identical `{ id, hotelId, deletedAt: null }` shape as `roomTypes.ts`, and returns the same 404 whether the id doesn't exist or belongs to another hotel — correctly refuses to let existence leak, matching this project's established discipline since 02-02.
- **Role gate is checked before any DB call**, not after — cheap rejection, no wasted query, matches `roomTypes.ts`'s `ADMIN_ROLES` pattern exactly.
- **No schema change was originally proposed** for a feature whose backing schema already exists (Phase 1's `Room`/`HousekeepingStatus`) — correctly recognized this as a pure-consumer plan rather than inventing unnecessary structural work. (This verdict is revised only for the accountability fields below, not for the general instinct.)
- **Explicit boundary against touching `DailyInventory.availableCount`** when a room is marked `OUT_OF_SERVICE` — correctly defers to PROJECT.md's stated Out-of-Scope item instead of quietly building it in as scope creep.
- **No silent-failure UI** — the frontend task explicitly requires reverting an optimistic update and surfacing an inline error on a failed PATCH, rather than the common anti-pattern of updating local state and ignoring the network result.

## 3. Enterprise Gaps Identified

**Audit-trail gap (release-blocking).** This plan's `PATCH /api/rooms/:roomId` is the only mutating endpoint in the entire project with no record of who performed the mutation or when. Every other mutable entity — `Booking.createdByUserId`, `Payment.processedByUserId`, `RoomType.lastModifiedByUserId`/`deletedByUserId`, `RatePlan.lastModifiedByUserId`/`deletedByUserId`, `PushQueue.retriedByUserId`/`lastRetriedAt` — carries this. A real operational scenario this gap fails: a guest complains a room was dirty at check-in; staff disputes whose responsibility that was. With no `lastChangedByUserId`/`lastChangedAt`, there is no way to reconstruct which staff member last marked the room CLEAN, or when — a straightforward audit-defensibility failure for a hospitality operations system, and inconsistent with this project's own repeatedly-applied convention.

**Role-asymmetry left implicit.** GET is unrestricted by role while PATCH is restricted to three of four roles — a reasonable design (read carries no mutation risk), but the original plan never stated this as a decision, only as an implementation detail buried in a task's action text. A future auditor or maintainer reading only the acceptance criteria would have no way to confirm this was intentional versus an oversight.

## 4. Concrete Upgrades Required

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | No audit trail on Room status mutation | Frontmatter (`files_modified`), new Task 1 (schema migration), Task 2's action/verify (was Task 1), AC-3, `<boundaries>` DO NOT CHANGE | Added `Room.lastChangedByUserId`/`lastChangedAt` (plain nullable, matching `RoomType.lastModifiedByUserId` convention exactly — schema edited, migration task added as new Task 1); PATCH now sets both; AC-3 amended to require them; GET/PATCH responses include them |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | GET/PATCH role asymmetry undocumented as a decision | `<acceptance_criteria>` (new AC-3a) | Added explicit AC-3a: FRONT_DESK can GET (200) but not PATCH — makes the asymmetry a stated, testable decision |
| 2 | Verify/done blocks didn't reference the new accountability fields | Task 2's `<verify>`/`<done>` | Extended both to assert `lastChangedByUserId`/`lastChangedAt` are set on success and unchanged on every rejection path |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 1 | No optimistic-concurrency/stale-read guard against two staff racing to update the same room | Low real-world likelihood at this project's stated 10-80-room, single-hotel, small-staff scale; last-write-wins is acceptable MVP behavior for a status toggle (not a financial or availability-affecting field once the OOS/inventory link is itself out of scope). Revisit only if this causes real reported confusion in practice. |
| 2 | Rate limiting on GET/PATCH /api/rooms | No elevated abuse surface — JWT-authenticated, no PII, no financial impact, no brute-forceable secret. Consistent with the rest of the non-auth API surface, which also carries no per-route rate limiting beyond login. |
| 3 | Restricting `OUT_OF_SERVICE` to admin-only roles | Would directly contradict ROADMAP.md's stated Phase 6 scope ("Housekeeping staff update room status from a phone-sized screen" — all four statuses, no role carve-out specified). Not a gap; a scope decision already made upstream in ROADMAP.md. |

## 5. Audit & Compliance Readiness

With the must-have fix applied, the plan now produces defensible audit evidence for its one mutation path (who, when), matches this project's established accountability convention exactly, and its rejection paths (403/400/404) all explicitly require the underlying row to remain unchanged — verifiable, not just claimed. No payment, webhook, or guest-PII surface is touched, so this plan does not trigger SPECIAL-FLOWS.md's `security-review`/`gsd-security-auditor` requirement, correctly noted in the plan's `<skills>` section.

## 6. Final Release Bar

Before this ships: the migration must apply cleanly, the six backend checks in Task 2 must all pass (including the two new accountability-field assertions), and the human-verify checkpoint must be approved live on an actual phone-sized viewport — the plan does not claim mobile usability from code review alone, correctly requiring a real device/emulated-viewport check. Remaining risk if shipped as amended: the two deferred items above (concurrent-edit race, no rate limiting) are real but low-probability at this project's current single-pilot-hotel scale, and are explicitly logged rather than silently absent. I would sign my name to the amended plan.

---

**Summary:** Applied 1 must-have + 2 strongly-recommended upgrades. Deferred 3 items.
**Plan status:** Updated and ready for APPLY

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
