# Enterprise Plan Audit Report

**Plan:** .paul/phases/02-front-desk-booking-core/02-01-PLAN.md
**Audited:** 2026-08-15
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Not enterprise-ready as originally written. The architectural bones were solid (generic 401s preventing user enumeration, minimal JWT claims, fail-loud on missing secret) but the plan had no brute-force protection, no error-handling discipline, and left the JWT-revocation tradeoff undocumented. This is the first plan in the project handling real credentials — the bar here is materially higher than Phase 1's schema-only plans, and I would not have approved the original for production. Conditionally acceptable as amended.

## 2. What Is Solid

- **Identical 401 for wrong-password vs nonexistent-email**, explicitly called out as a user-enumeration defense — correctly identified without being prompted.
- **JWT payload minimalism** (userId, hotelId, role only — no email, no extra PII) — right instinct, nothing to fix.
- **Fail-loud on missing JWT_SECRET** — correct posture (though the original didn't validate strength, fixed below).
- **No self-service signup, admin-run create-user script** — correctly matches PROJECT.md's white-glove onboarding constraint instead of building a registration flow nobody asked for.
- **security-review + gsd-security-auditor already registered as required** in the plan's own skills section — the plan correctly identified its own risk class before I even started auditing.

## 3. Enterprise Gaps Identified

- **No rate limiting on login.** bcrypt cost 12 is not a throttle — it's ~100-300ms per guess, still several attempts/second unthrottled. This endpoint is internet-facing and guards guest PII and payment records.
- **No JWT_SECRET strength validation.** "Fail if missing" was specified; "fail if weak" was not — a 4-character secret would have passed silently.
- **No error-handling discipline.** Nothing in the plan prevented an unhandled DB error from producing a 500 with a leaked stack trace.
- **No password policy in create-user.ts.** Nothing stopped a real staff account from being provisioned with a trivially weak password.
- **Undocumented revocation tradeoff.** The user explicitly chose JWT-stateless over server-side sessions, trading away instant revocation for simplicity — a reasonable choice, but the plan didn't record it as a conscious, accepted risk anywhere. An auditor (or a future incident) discovering this undocumented would read as an oversight, not a decision.
- **Minor:** email case-sensitivity not handled — a real user could be silently locked out by a case mismatch between account creation and login.
- **Minor:** `GET /api/me` was framed as disposable test scaffolding when it's actually the correct permanent "who's logged in" endpoint the future frontend needs.
- **Minor:** zero trace of failed login attempts — no logging at all, meaning a brute-force attempt or account-takeover attempt would leave no evidence for later investigation.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | No rate limiting on login | Task 2 (action, verify), verification checklist | Added `express-rate-limit`, 5 attempts/15min/IP, 429 on exceed; in-memory store appropriate for current single-instance deployment |
| 2 | No JWT_SECRET strength validation | Task 2 (auth.ts action, verify), verification checklist | Added startup check: JWT_SECRET must exist AND be ≥32 characters, `process.exit(1)` otherwise |
| 3 | No error-handling discipline | Task 2 (login route + middleware actions), verification checklist | Login route and middleware now wrap all DB/verification calls in try/catch, log real errors server-side, return generic 401/500 with no leaked detail |
| 4 | No password policy in create-user.ts | Task 1 (action, verify) | Added ≥12-character minimum, rejected with no row created otherwise |
| 5 | Undocumented revocation tradeoff | Boundaries section | Added an explicit "Accepted risk, on the record" entry documenting the JWT-stateless tradeoff as a deliberate architectural choice, not an oversight |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Email case-sensitivity | Task 1 (create-user.ts), Task 2 (login route) | Normalize email to lowercase at both creation and login lookup |
| 2 | GET /api/me framed as throwaway | Task 3 | Reframed as the real, permanent current-session endpoint the Phase 2 UI will use |
| 3 | No trace of failed login attempts | Task 2 (login route action) | Added structured console logging of failed attempts (timestamp, normalized email, source IP — never the password) as a minimal trace until Phase 7's real audit-log infrastructure exists |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 1 | No CORS configuration | No cross-origin browser client exists yet; add it in whichever plan (02-04 or later) first stands up a frontend calling this API from a different origin |
| 2 | No distributed/shared rate-limit store | Current deployment is a single backend instance (Railway/Render); an in-memory limiter is correct now, revisit only if horizontally scaled |
| 3 | No persistent audit-log table for auth events | Console logging of failed attempts is the minimal trace for now; a real structured audit log belongs to Phase 7's monitoring/observability work, not this foundational auth plan |

## 5. Audit & Compliance Readiness

With the must-have fixes applied: the login endpoint now produces defensible evidence of failed attempts, unexpected errors fail safely without leaking internals, brute-force is throttled, and the one deliberate residual risk (no instant token revocation) is on the record as an accepted tradeoff rather than a silent gap. The plan still correctly defers CORS, distributed rate-limiting, and full audit-log infrastructure — none of those are load-bearing for this plan's actual scope, and building them now would be scope creep beyond what a foundational auth plan needs.

## 6. Final Release Bar

**Must be true before this plan ships (as amended):** rate limiting confirmed live (429 on the 6th rapid attempt), JWT_SECRET strength check confirmed (server refuses to boot on a weak/missing secret), error paths confirmed to never leak internals, smoke test passes twice covering all of the above plus the original AC-1 through AC-5.

**Risk remaining if shipped as amended:** the accepted JWT-revocation tradeoff means a stolen terminal or same-day-terminated employee retains access for up to 12 hours. This is a known, documented, and deliberately chosen risk — not a gap — but it should be revisited if a real incident occurs or once multiple hotels are live and the exposure surface grows.

I would sign off on this plan as amended. I would not have signed off on the original — no rate limiting on a credential endpoint guarding guest PII, with no error-handling discipline, is not a defensible position for a system handling real payment records.

---

**Summary:** Applied 5 must-have + 3 strongly-recommended upgrades. Deferred 3 items.
**Plan status:** Updated and ready for APPLY

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
