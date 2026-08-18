# Enterprise Plan Audit Report

**Plan:** .paul/phases/02-front-desk-booking-core/02-02-PLAN.md
**Audited:** 2026-08-16
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Not enterprise-ready as originally drafted, though closer than usual — the core multi-tenant isolation design (hotelId derived only from the verified JWT, generic 404 for cross-tenant access, an explicit cross-tenant test already planned) was correctly instinctive from the start. Two real gaps remain: an error-handling scope hole that contradicts the fail-safe pattern 02-01 already established and verified, and a data-completeness ambiguity that will confuse real hotel staff once Phase 3 lets them create room types before seeding runs. Conditionally acceptable as amended.

## 2. What Is Solid

- **hotelId sourced exclusively from `req.auth`, never from client input, on both endpoints.** This is the actual tenant-isolation control, correctly identified as such in the plan's own action text — not left implicit.
- **404, not 403, for cross-tenant access**, with an explicit rationale (a 403 would confirm the resource exists at all) and a dedicated AC (AC-4) and smoke-test case for it. This is exactly the kind of information-leak reasoning that's easy to miss and wasn't missed here.
- **Date-range cap (400 days) preventing pathological query sizes**, tied to a concrete rationale (matches the 365-day seed horizon) rather than an arbitrary number.
- **Deliberately deferred scope (pagination, caching, role-based restriction) is reasoned, not silent** — the plan explains why each is out of scope rather than just omitting them.

## 3. Enterprise Gaps Identified

- **Error-handling scope gap:** Task 2's try/catch as originally drafted wrapped only "steps 3-4" (the data queries), leaving the tenant-ownership check itself outside error handling. A transient DB error during that specific query would produce an uncontrolled Express error response instead of the generic-500 pattern 02-01 already built and independently verified. Same failure class, different location — worth catching before it repeats.
- **Data-completeness ambiguity:** the original plan built `days[]` by mapping over whatever DailyInventory rows exist, rather than iterating the full requested date range. A RoomType with no seeding yet (a normal state per 01-02's own precedent) would silently produce a shorter `days[]` array with no indication why — a state-ambiguity bug per the audit's own risk category, not just a minor omission.
- **Minor input-validation gap:** date format was checked with a regex only, which accepts syntactically-valid-but-calendar-impossible values like `2026-02-30` — JS's lenient Date parsing would silently roll that over to March 2nd rather than erroring, producing a silently wrong range from an innocent typo.
- **Minor test-completeness gap:** the smoke test's AC-4 coverage only asserted the cross-tenant case returns 404, not that it's response-*identical* to the plain nonexistent-id case — leaving open whether the two are truly indistinguishable to a caller.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | try/catch didn't cover the tenant-ownership check | Task 2 (action, verify), verification checklist | Entire handler body from date-validation onward now wrapped in one try/catch, matching 02-01's established pattern exactly |
| 2 | Unseeded dates silently omitted from days[] | Task 2 (action, verify), AC-3, verification checklist | days[] now built by iterating every date in the requested range explicitly; missing DailyInventory rows produce a seeded:false entry instead of being dropped |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Regex-only date validation accepts impossible dates | Task 2 (action, verify), AC-6 | Added round-trip validation (reformat parsed Date, compare to original input string) to reject dates like 2026-02-30 |
| 2 | AC-4 smoke test didn't prove full response-indistinguishability | Task 3 (action) | Added a second assertion comparing the cross-tenant case's response body byte-for-byte against a plain nonexistent-id case |

### Deferred (Can Safely Defer)

None beyond what the plan itself already reasoned through in its own boundaries section (pagination, caching, role-based restriction) — no additional deferrals identified by this audit.

## 5. Audit & Compliance Readiness

With the must-have fixes applied: any unexpected failure anywhere in the calendar endpoint's execution path now fails safely with a generic 500, matching the precedent 02-01 established rather than reintroducing the same class of gap in a new location. The days[] completeness fix closes a real state-ambiguity risk that would otherwise surface as a confusing, hard-to-diagnose bug once real hotels exist with partially-seeded room types. Both remaining strongly-recommended items are defense-in-depth for edge cases (a mistyped date, a slightly incomplete indistinguishability proof) rather than release-blocking gaps.

## 6. Final Release Bar

**Must be true before this plan ships (as amended):** the cross-tenant 404 test passes against real data (not just code inspection), days[] length matches the requested range exactly including unseeded dates, and the full handler's error path is confirmed to fail safely (verify by temporarily forcing a DB error in the ownership-check step during testing, or trust the code-level try/catch placement plus the existing 02-01 precedent).

**Risk remaining if shipped as amended:** none identified beyond what's already explicitly deferred in the plan's own boundaries (no role-based restriction, no pagination, no caching) — all reasoned, none silent.

I would sign off on this plan as amended.

---

**Summary:** Applied 2 must-have + 2 strongly-recommended upgrades. Deferred 0 new items.
**Plan status:** Updated and ready for APPLY

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
