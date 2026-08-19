# Enterprise Plan Audit Report

**Plan:** `.paul/phases/02-front-desk-booking-core/02-03-PLAN.md`
**Audited:** 2026-08-18
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Not enterprise-ready as originally drafted — five release-blocking gaps, all now applied to the plan. Conditionally acceptable as amended below. I would sign off on the amended version for a pre-revenue, single-market (PH) SaaS at this stage; I would not have signed the original draft, specifically because of the unspecified raw-SQL construction (M1) and the complete absence of an authorization boundary (M2) on a financial write endpoint.

## 2. What Is Solid

- **The core atomicity mechanism is correct.** Conditional UPDATE inside a single Prisma transaction, rollback-on-any-date-failure — this is a legitimate, well-reasoned concurrency-safety pattern, not a naive check-then-write race. The reasoning for choosing it over SELECT FOR UPDATE (avoids lock-ordering deadlock risk, leans on Postgres's native row-level serialization) is sound and was made as an explicit decision, not a default.
- **The byte-identical-404 pattern is correctly carried forward** from 02-01/02-02, applied consistently to a new write-path endpoint rather than reinvented.
- **The all-or-nothing multi-night guarantee (AC-4) is architecturally sound** — throwing inside the Prisma transaction to trigger automatic rollback is the right primitive, not a manual multi-step undo.
- **The Assumptions Requiring Review section is a genuine strength**, not just process theater — it correctly identifies real judgment calls (booking status, absent payment tracking, guest-matching strategy) instead of burying them in prose.

## 3. Enterprise Gaps Identified

1. **SQL injection footgun (raw SQL construction underspecified).** The original task action described the conditional UPDATE with quoted SQL containing `${}` interpolation without specifying whether this is a Prisma tagged-template literal (auto-parameterized) or a manually-built string. On a financial write endpoint, an implementer following the letter of an ambiguous instruction could introduce string-concatenated SQL. Even with today's server-validated inputs, this is the kind of latent risk that becomes exploitable the moment any field in that query gains a more permissive source later.
2. **No authorization boundary.** The original plan gated on authentication only (`requireAuth`), with zero role check. Every authenticated user — including `HOUSEKEEPING` — could create a financial booking record. This is a missing authorization boundary, explicitly named in the audit's own risk checklist.
3. **Silent-undercharge risk on missing pricing data.** If any date in the requested range lacks a `RatePlanDailyRate` row, the original plan's total-computation step had no specified behavior — depending on implementation, this silently produces `NaN`, an incomplete sum, or a thrown unhandled error surfaced as a raw 500. A booking system must never proceed with an unpriced or partially-priced total.
4. **Unspecified arithmetic precision on money.** "Sum the rate values" does not specify Decimal-safe arithmetic. Prisma returns `Decimal` (decimal.js) for `@db.Decimal` columns; summing via native JS `number` risks silent floating-point drift on a field the project's own decision log already flagged as audit-critical (see PROJECT.md's totalPriceSnapshot decision from Phase 1's own audit).
5. **Unbounded transaction size.** No cap on stay length. A pathological or malformed request (e.g. a client bug sending a multi-year range) would issue an unbounded number of sequential `$executeRaw` calls inside one open transaction — a correctness/performance risk, not just a DoS concern (DoS explicitly excluded from this audit's scope, but the unbounded-transaction-size angle is a data-integrity/lock-duration risk regardless).
6. **No duplicate-submission protection.** A front-desk double-click or a client-side retry after a slow response has no server-side guard — nothing in the original plan prevents two Bookings being created for the same guest/room/date-range from the same well-intentioned double submission. This is an audit-trail-integrity concern: duplicate financial records are exactly the kind of thing that fails a real reconciliation review.
7. **`minStay` policy silently unenforced.** `RatePlanDailyRate.minStay` exists specifically to gate booking length; the original plan neither enforced it nor mentioned it. Underspecified behavior here reads as an oversight, not a decision.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | SQL injection footgun in raw UPDATE | Task 1 `<action>` | Explicit instruction to use a Prisma tagged-template literal for `$executeRaw` (auto-parameterized), explicit prohibition on string concatenation / `Prisma.raw` |
| 2 | Missing authorization boundary | Task 1 `<action>`, new AC-7 | Added role gate (`FRONT_DESK`/`HOTEL_ADMIN`/`SUPER_ADMIN` only, `HOUSEKEEPING` → 403) as the first check in the handler |
| 3 | Silent-undercharge on missing pricing data | Task 1 `<action>`, new AC-9 | Added explicit pre-transaction pricing-availability check: date range must have a full set of `RatePlanDailyRate` rows or the request is rejected 409 before any DB mutation |
| 4 | Unspecified money-arithmetic precision | Task 1 `<action>` | Explicit instruction to use Decimal-safe arithmetic (decimal.js methods) for the running total, never native JS `number` |
| 5 | Unbounded transaction size (no max stay length) | Task 1 `<action>`, amended AC-5 | Added 30-night maximum stay-length validation, rejected with 400 before the transaction opens |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | No duplicate-submission protection | Task 1 `<action>`, new AC-8 | Added a lightweight 30-second dedupe check (same hotelId/roomTypeId/dates/guest email) inside the transaction, rejecting with 409 — explicitly scoped as a lightweight guard, not a full idempotency-key system, to match the plan's existing scope |
| 2 | `minStay` silently unenforced | `<boundaries>` SCOPE LIMITS | Added explicit boundary note documenting this as a deferred decision, not a silent gap |
| 3 | Single-room-type-per-request not stated | `<boundaries>` SCOPE LIMITS | Added explicit boundary note for clarity — was implied by the request shape but not stated |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 1 | No inline documentation of why Read Committed isolation is sufficient | Doesn't change behavior; a future maintainer risk (someone "fixing" it by adding unneeded SERIALIZABLE isolation) rather than a current-plan risk. Worth a code comment during implementation, not a plan-level requirement. |
| 2 | No guest email/phone format validation | Data-quality concern, not a security or financial-integrity concern. Low cost to add later without touching the transaction logic. |
| 3 | 409 response body detail on the SOLD_OUT/duplicate paths not fully specified | Existing instruction ("clean message, not a stack trace") already covers the real risk (leaking internals); further specification is cosmetic. |

## 5. Audit & Compliance Readiness

- **Audit evidence:** Solid. `createdByUserId` on Booking ties every walk-in booking to a specific staff account; the amended plan now also closes the "who created it" question for HOUSEKEEPING-role misuse (blocked outright rather than logged after the fact).
- **Silent failures:** The original plan had two silent-failure paths (missing pricing data, unspecified duplicate handling) — both closed by this audit. No known silent-failure paths remain in scope.
- **Post-incident reconstruction:** Adequate for this plan's scope. `totalAmount`/`totalPriceSnapshot` are preserved once computed; the amended plan ensures they're never computed from incomplete data.
- **Ownership/accountability:** Adequate. Role gate now exists; `createdByUserId` already existed.
- **What would fail a real audit if shipped unamended:** Findings 1 and 2 above (SQL-injection-shaped code pattern, zero authorization boundary on a financial write path) would both be flagged immediately by any external security or compliance review. Both are now closed.

## 6. Final Release Bar

**What must be true before this plan ships (APPLY):**
- All 5 must-have changes actually implemented as specified (tagged-template SQL, role gate, missing-rate guard, Decimal arithmetic, max-nights cap) — not just present in the plan text.
- Both smoke tests (functional + concurrency) passing live, including the new assertions added for AC-7/AC-8/AC-9.
- security-review and gsd-security-auditor both run per SPECIAL-FLOWS.md's guest-PII trigger, with live adversarial probing on the concurrency race and the new role/dedupe/pricing-gap paths specifically.

**What risks remain if shipped exactly as amended:**
- The duplicate-submission dedupe is intentionally lightweight (30-second window, not a real idempotency-key system) — a determined double-submission outside that window, or from two different but equivalent requests, would not be caught. Acceptable at pre-revenue/manual-front-desk scale; revisit if booking volume or API-driven (non-staff) submission is ever added.
- `minStay` remains unenforced — a documented, deliberate gap, not a silent one.
- No Payment record exists yet (Assumption 2, carried from the plan's own Assumptions section) — this remains the user's call, not re-litigated by this audit.

**Sign-off:** I would sign this system as amended, for its stated scope (pre-revenue, single-market, front-desk-only booking creation) — contingent on the must-have items actually landing in code as specified during APPLY, not just in this plan document.

---

**Summary:** Applied 5 must-have + 3 strongly-recommended upgrades. Deferred 3 items.
**Plan status:** Updated and ready for APPLY.

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
