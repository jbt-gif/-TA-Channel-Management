---
phase: 02-front-desk-booking-core
plan: 01
subsystem: auth
tags: [jwt, jose, bcrypt, express, rate-limiting, multi-tenant]

requires:
  - phase: 01-data-model-foundation
    provides: User model (email, passwordHash, role, hotelId) — this plan is the first thing to populate passwordHash with a real hash and read it back
provides:
  - JWT-based front-desk authentication (login endpoint, verify middleware)
  - The req.auth = { userId, hotelId, role } shape every later Phase 2+ route depends on for tenant scoping
  - Admin-run staff onboarding script (create-user.ts), matching the white-glove onboarding model
  - GET /api/me — the permanent current-session endpoint the future frontend will use
affects: [02-02-calendar-grid-api, 02-03-booking-transaction, 02-04-frontend-ui, phase-03-hotel-admin-config-ui]

tech-stack:
  added: [bcryptjs, jose, express-rate-limit]
  patterns:
    - "JWT (HS256 via jose, stateless, 12h expiry) — no server-side session table, no refresh flow"
    - "Generic, byte-identical error responses AND matched response timing for auth failures — prevents both response-body and timing-based user enumeration"
    - "JWT_SECRET validated for length at module load, process.exit(1) if missing/weak — no silent insecure fallback"
    - "Fail-safe error handling: unexpected errors in auth code paths always resolve to a generic 401/500, never a leaked stack trace"
    - "app.ts (Express app construction) separated from server.ts (listen() call) — lets tests/scripts run the app on an ephemeral port without starting the real server"

key-files:
  created:
    - src/app.ts
    - src/lib/auth.ts
    - src/middleware/auth.ts
    - src/routes/auth.ts
    - src/scripts/create-user.ts
    - src/scripts/smoke-test-auth.ts
    - .paul/phases/02-front-desk-booking-core/SECURITY.md
  modified:
    - src/server.ts
    - package.json
    - .env.example
    - .env

key-decisions:
  - "JWT (stateless) chosen over server-side sessions — user-confirmed checkpoint:decision. Accepted tradeoff: no instant token revocation before 12h expiry, documented in PROJECT.md/STATE.md/this plan's boundaries as a deliberate risk, not a gap."
  - "Auth added as its own plan (02-01) even though ROADMAP.md's original Phase 2 scope text never named it — every later route needs authenticated hotelId context, and this is the 'multi-tenant auth/isolation phase' SPECIAL-FLOWS.md reserves a security-review pass for."
  - "GET /api/me built as permanent API surface (audit-driven reframe), not throwaway test scaffolding — the future frontend needs it to show current session context."

patterns-established:
  - "Every auth-adjacent code path (login, middleware) wraps unexpected errors and returns a generic response — never trust that the happy path is the only path that executes"
  - "Any timing-sensitive comparison (e.g. bcrypt on a not-found user) must run a real, correctly-shaped dummy computation, not a shortcut — verified this the hard way this plan (see Issues Encountered)"

duration: "~1 session (across a pause/resume)"
started: "2026-08-15"
completed: "2026-08-16"
---

# Phase 2 Plan 01: Front-Desk Authentication Summary

**JWT-based login, verification middleware, and admin staff-onboarding tooling built and security-verified against the real Supabase dev database — including catching and fixing a genuine timing side-channel vulnerability before it shipped.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1 session, paused overnight before APPLY per explicit approval gate |
| Started | 2026-08-15 |
| Completed | 2026-08-16 |
| Tasks | 3 completed (password hashing + admin script, login + middleware, protected route + smoke test) |
| Files modified | 6 created, 4 modified, 1 security report created |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Staff can log in with valid credentials | Pass | 200 + JWT containing userId/hotelId/role, verified via smoke test and manual curl |
| AC-2: Invalid credentials rejected without leaking which part was wrong | Pass | Byte-identical 401 bodies confirmed; **timing parity also required a fix** — see Issues Encountered |
| AC-3: Auth middleware enforces valid, unexpired tokens | Pass | Missing/malformed/wrong-secret tokens all 401, next() never called on failure |
| AC-4: Auth middleware attaches correct hotel-scoping context | Pass | req.auth = {userId, hotelId, role} verified to match the authenticated user exactly |
| AC-5: Passwords never stored/logged in plaintext | Pass | bcrypt cost-12 hash confirmed in DB; create-user.ts never echoes the plaintext argument |
| AC-6 (audit-added): DB rejects structurally invalid data | N/A for this plan | No new schema/CHECK constraints in this plan — inherited from Phase 1 |
| AC-7 (audit-added): Booking/Payment record acting staff member | N/A for this plan | Belongs to 02-03 (booking transaction), not this auth plan — mislabeled AC number carried over from template, no actual gap |

## Accomplishments

- Every later Phase 2+ route now has a concrete, proven pattern for getting authenticated hotelId context (`req.auth` via `requireAuth` middleware)
- Caught a **real, exploitable vulnerability during the mandatory `gsd-security-auditor` pass** that neither my own manual security-review nor the automated smoke test (body-equality only) caught: a malformed dummy bcrypt hash (57 chars instead of the required 60) caused bcryptjs to short-circuit on the "user not found" path, creating a ~1,300x timing differential (~0.2ms vs ~260ms) that would let an attacker distinguish "no such email" from "wrong password" via response timing alone, despite identical response bodies. Fixed with a genuine cost-12 hash constant; independently re-verified by the same auditor agent with fresh measurements.
- Rate limiting, JWT_SECRET strength validation, and fail-safe error handling — all audit-driven additions — confirmed live via direct testing, not just present in code
- Zero regressions: all three Phase 1 smoke tests (schema, inventory, booking) re-verified passing after auth code was added

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app.ts` | Created | Express app construction, separated from server startup so tests can run it on an ephemeral port |
| `src/server.ts` | Modified | Now just imports app.ts and calls listen() — minimal entrypoint |
| `src/lib/auth.ts` | Created | JWT sign/verify via jose; JWT_SECRET strength validation at module load |
| `src/middleware/auth.ts` | Created | `requireAuth` — verifies Bearer token, attaches req.auth, 401 on any failure |
| `src/routes/auth.ts` | Created | POST /api/auth/login — rate-limited, generic 401s, timing-safe dummy comparison, fail-safe error handling |
| `src/scripts/create-user.ts` | Created | Admin CLI for staff onboarding — bcrypt hash, ≥12-char password floor, lowercase email normalization |
| `src/scripts/smoke-test-auth.ts` | Created | Idempotent end-to-end verification, ephemeral-port self-contained server |
| `.paul/phases/02-front-desk-booking-core/SECURITY.md` | Created | gsd-security-auditor's threat-verification report (10/10 mitigations confirmed) |
| `package.json` | Modified | Added bcryptjs, jose, express-rate-limit; smoke-test-auth script |
| `.env.example` / `.env` | Modified | JWT_SECRET placeholder / real 64-byte random value (never echoed to chat or committed) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| JWT stateless auth (checkpoint:decision, user-confirmed) | Simpler than server-side sessions, no Session table, matches existing backend stack | Accepted: no instant token revocation before 12h expiry — documented, not silently gapped |
| Auth built as its own plan before calendar/booking APIs | Original ROADMAP text never named auth, but every later route needs hotelId-scoping context | Phase 2 scope corrected in ROADMAP.md during planning, not silently assumed |
| GET /api/me built as permanent, not throwaway | Audit finding — the future frontend needs a real "who's logged in" endpoint anyway | Avoids shipping disposable test scaffolding that looks like dead code later |
| Dummy bcrypt hash for timing-safety must be genuinely valid-format | Security-auditor finding — a malformed placeholder defeated the entire mitigation it was meant to provide | Fixed with a real, correctly-shaped 60-char hash; now independently timing-verified |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 2 | Both essential correctness/security fixes, no scope creep |
| Scope additions | 0 | — |
| Deferred | 3 (carried from audit, not new) | Already tracked in the plan's own boundaries section |

**Total impact:** One structural refactor to make the smoke test's ephemeral-port design work, and one real security fix caught by the mandatory security-auditor pass. Both are exactly what the PAUL loop's verification steps exist to catch.

### Auto-fixed Issues

**1. [Structural] app.ts/server.ts split required for ephemeral-port smoke testing**
- **Found during:** Task 3 (smoke test)
- **Issue:** Plan's Task 3 specified spinning up the app on an ephemeral port within the smoke test script, but the original server.ts called `app.listen(port)` as a side effect of import — importing it for testing would have bound the real configured port, not an ephemeral one
- **Fix:** Split into `src/app.ts` (exports the configured Express app, no listen call) and `src/server.ts` (imports app, calls listen with the real PORT) — a standard, minimal pattern
- **Files:** `src/app.ts` (new), `src/server.ts` (modified)
- **Verification:** smoke-test-auth.ts successfully spins up its own instance on port 0 and tears it down cleanly

**2. [Security] Malformed timing-safety dummy hash defeated its own mitigation**
- **Found during:** Post-APPLY `gsd-security-auditor` pass (mandatory per SPECIAL-FLOWS.md for this auth/multi-tenant-isolation phase)
- **Issue:** The dummy bcrypt hash used to keep "user not found" and "wrong password" login paths timing-equivalent was 57 characters instead of the required 60-character bcrypt format, causing bcryptjs to short-circuit (~0.2ms) instead of running the real cost-12 comparison (~260ms) — a ~1,300x timing differential that leaked whether an email existed via response timing, despite identical response bodies
- **Fix:** Replaced with a genuine bcrypt hash of a dummy value, generated via `bcrypt.hashSync` at build time, stored as a named constant with an explanatory comment
- **Files:** `src/routes/auth.ts`
- **Verification:** Direct timing measurement (8 trials): real-hash and dummy-hash comparisons both land in the ~258-264ms range, no measurable differential; independently re-verified by the security-auditor agent with its own fresh measurements before signing off

### Deferred Items

Carried forward from `02-01-AUDIT.md`, not new: CORS configuration (no cross-origin client exists yet), distributed rate-limit store (single-instance deployment today), persistent auth audit-log table (Phase 7's monitoring work). All explicitly scoped out in the plan's boundaries, not oversights.

## Issues Encountered

The timing side-channel above is the notable one — worth stating plainly: **neither my own manual code review nor the automated smoke test caught it.** The smoke test only checked response-body equality (which was correct), not response timing. Only the dedicated `gsd-security-auditor` agent's live timing measurement surfaced it. This is exactly why SPECIAL-FLOWS.md reserves that agent specifically for auth/payment/webhook phases rather than treating enterprise-plan-audit alone as sufficient — the plan-level audit strengthens the *design*, but only a post-APPLY verification pass against the *actual running code* catches an implementation bug like this one.

## Next Phase Readiness

**Ready:**
- `requireAuth` middleware and `req.auth` shape are proven and ready for every Phase 2+ protected route
- Staff account provisioning is unblocked (create-user.ts) for whoever needs a real login to test against
- GET /api/me gives the eventual frontend a real session-lookup endpoint from day one

**Concerns:**
- None blocking. Accepted risk on record: JWT-stateless means no instant revocation before 12h expiry — revisit only if a real incident occurs or once multiple hotels are live.
- CORS still needs configuring whenever the first cross-origin frontend client is built (02-04 or later).

**Blockers:**
- None.

**Phase 2 status:** 1 plan complete (auth foundation). Calendar grid query API, atomic booking transaction, and React UI remain — plans TBD, drafting next.

---
*Phase: 02-front-desk-booking-core, Plan: 01*
*Completed: 2026-08-16*
