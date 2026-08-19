# Enterprise Plan Audit Report

**Plan:** .paul/phases/03-hotel-admin-config-ui/03-01-PLAN.md
**Audited:** 2026-08-18
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Not enterprise-ready as originally drafted. The plan's happy-path CRUD design was sound and consistent with this project's existing patterns, but it shipped one release-blocking gap: nothing stopped a hotel admin from soft-deleting a room type or rate plan that had active future bookings against it, silently hiding an in-use resource from the staff who'd need to service those guests. With the must-have and strongly-recommended fixes now applied to the plan, I would sign off on this for APPLY. I would not have signed off on the original draft.

## 2. What Is Solid

- **Tenant-scoped `findFirst` + byte-identical 404 pattern**, reused verbatim from `roomTypes.ts`/`bookings.ts`. This is the correct move — a distinguishable "belongs to another hotel" vs "doesn't exist" response is itself a tenant-isolation leak, and this plan doesn't repeat that mistake anywhere.
- **DB-level CHECK constraint on `downpaymentPercent`**, not just app-layer validation. Matches the project's established discipline (01-02's `bookedCount+heldCount<=availableCount`, 01-03's booking constraints) of never trusting application code alone as the real backstop.
- **Reuse of `seedInventoryForRoomType()` rather than reimplementing seeding logic.** Correct call — that function is already tested and idempotent; a second hand-rolled seeding path would only risk drifting out of sync with it.
- **Decimal-safe money handling for `basePrice`**, consistent with `bookings.ts`'s established pattern for the same reason (float arithmetic on currency is a real, recurring bug class this project has already been careful about).
- **The plan's own "Assumptions Requiring Review" section** (Room-CRUD-not-in-scope, role-gate choice, basePrice-doesn't-retroactively-rewrite-rates) is exactly the right instinct — surfacing genuine scope/design ambiguity instead of silently picking an interpretation. This is the practice this project adopted after the 02-03 incident and it's holding.

## 3. Enterprise Gaps Identified

1. **No safeguard against deleting actively-booked inventory (release-blocking).** Soft-deleting a RoomType or RatePlan makes it vanish from every list/calendar endpoint (`deletedAt: null` filtering), but does nothing to existing `BookingItem` rows for future stays. Front-desk staff lose the ability to browse to that room type/rate plan at all — meaning they can no longer service an existing guest's upcoming reservation through the normal UI. Given PROJECT.md's explicit target-user profile ("Limited technical sophistication — needs a simple, self-explanatory admin UI"), a non-technical hotel admin has no reason to expect that deleting a room type could orphan a guest's reservation from staff view. This is a data-integrity/operational-safety gap, not a security one, but it's exactly the class of "silent failure path" PROJECT.md's own Technical Context section calls out as elevated-priority given the founder can't independently spot subtle bugs by reading code.

2. **No accountability trail on configuration writes (strongly recommended).** `RoomType`/`RatePlan` create/update/delete had no record of which user performed the action — no analogue to `Booking.createdByUserId`/`Payment.processedByUserId`. Phase 1's own audit reasoning for adding those fields ("a system handling real money needs a 'who did this' trail for dispute resolution; cheaper to add now than retrofit after real bookings exist") applies just as directly here: `basePrice` changes affect what guests get charged, and "who changed the price and when" is exactly the kind of question a dispute or an audit would ask.

3. **Repeat of a previously-fixed error-handling scope gap (strongly recommended).** 02-02's audit caught and fixed a try/catch that didn't cover the tenant-ownership check in that same router. This plan's original task descriptions didn't explicitly require the same full-body try/catch scope on the new handlers being added to that same file plus two new files — a real risk of reintroducing an already-identified bug class rather than a new one.

4. **PATCH endpoints didn't guard against empty/no-op update bodies (strongly recommended).** A PATCH with no recognized fields would either silently no-op or produce a confusing low-level Prisma error instead of a clear 400. Cheap to close, meaningfully improves API defensibility.

5. **No upper-bound sanity check on `basePrice` (can safely defer).** A typo (500,000 instead of 5,000) creates a technically-valid but almost certainly wrong rate plan, immediately live and bookable. Deferred because: no business requirement anywhere states a price ceiling, the mistake is self-correctable by the same admin who created it (visible immediately in 03-02's UI, not yet built), and unlike finding 1 it doesn't create data that's invisible/unreachable — it's just wrong until corrected.

6. **No duplicate-submission guard on the two POST endpoints (can safely defer).** `bookings.ts` has a 30-second dedupe guard for exactly this reason. Deferred here because the stakes are materially lower — a duplicated room type or rate plan is a visible, easily-deleted mistake with no financial consequence, unlike a duplicated paid booking.

7. **No rate limiting on any new endpoint (can safely defer).** Out of scope per this project's own `security-review` skill instructions, which explicitly exclude DOS/rate-limiting findings. All endpoints already require authentication, so unauthenticated abuse isn't possible.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Deleting a room type/rate plan with future bookings silently orphans them from staff view | AC-8 (new), Task 1's `DELETE` action + verify, Task 2's `DELETE` action + verify | Both DELETE handlers now check for any future non-cancelled `BookingItem` before deleting; 409 Conflict if found, record untouched |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 2 | No accountability trail on config writes | AC-9 (new), Task 1, Task 2, Task 3 (schema) | Added nullable `lastModifiedByUserId`/`deletedByUserId` to `RoomType`/`RatePlan`; all create/update/delete handlers now set them from `req.auth!.userId` |
| 3 | Try/catch scope gap risk (repeat of 02-02's fixed bug class) | Task 1, Task 2 action preambles | Explicit instruction added: wrap full handler body (lookup through response) in one try/catch, generic 500 on unexpected errors |
| 4 | PATCH endpoints don't reject empty update bodies | Task 1, Task 2 `PATCH` actions + verify | Added explicit 400 `"No fields to update"` check before any DB write |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|------------------------|
| 5 | No upper-bound sanity check on `basePrice` | No stated business requirement for a ceiling; self-correctable, not a silent-corruption risk |
| 6 | No duplicate-submission guard on POST endpoints | Materially lower stakes than `bookings.ts`'s financial-booking case; visible, easily-corrected mistake |
| 7 | No rate limiting on new endpoints | Explicitly excluded by this project's own security-review scope (DOS/rate-limiting) |

## 5. Audit & Compliance Readiness

With the applied fixes, configuration changes now produce a defensible trail: who made a change (`lastModifiedByUserId`/`deletedByUserId`), and the deletion-safety check prevents the one silent-failure path this plan could otherwise have introduced (a guest's reservation becoming unreachable through the normal staff UI with no error, no log, no indication anything went wrong). `Booking.totalPriceSnapshot` already immunizes past bookings against later `basePrice` edits, so no retroactive-billing risk exists here — that was verified as already-solid, not a gap.

One item flagged for UNIFY, not blocking APPLY: `security-review` isn't named for this plan by SPECIAL-FLOWS.md's literal trigger list ("payments, webhooks, auth, guest PII"), but this plan adds new authenticated, tenant-scoped write endpoints — the same risk shape as 02-03's booking-creation endpoint, which did get a security-review pass and had a real HIGH finding. Added as a verification-checklist item rather than silently skipping it on a technicality.

## 6. Final Release Bar

**Must be true before this plan ships:** the deletion-safety check (finding 1) must actually work — verified live against a real future booking, not just code-reviewed, since this is the one finding with a real silent-data-integrity consequence if it doesn't. The accountability fields and try/catch scoping should also be present but are lower-stakes if imperfect on day one (fixable without data loss).

**Risks if shipped as amended:** the three deferred items (basePrice ceiling, duplicate-submission guard, rate limiting) remain open. None are release-blocking at this stage of the product (pre-revenue, no real hotels yet) but should be revisited once real hotel admins are using this UI unsupervised.

**Sign-off:** Yes, with the applied fixes and provided the deletion-safety check is live-verified before UNIFY closes, consistent with how this project has verified every prior audit-flagged fix.

---

**Summary:** Applied 1 must-have + 3 strongly-recommended upgrades. Deferred 3 items.
**Plan status:** Updated and ready for APPLY.

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
