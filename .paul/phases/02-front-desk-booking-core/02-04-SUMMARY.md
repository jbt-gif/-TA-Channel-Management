---
phase: 02-front-desk-booking-core
plan: 04
subsystem: frontend
tags: [react, vite, tailwind, auth, first-frontend]

requires:
  - phase: 02-front-desk-booking-core (02-01)
    provides: POST /api/auth/login (email/password → JWT), GET /api/me (validates a token, returns userId/hotelId/role)
provides:
  - frontend/ — Vite + React + TypeScript + Tailwind, independently deployable from the backend
  - Working login flow against the real backend, JWT stored client-side, session persists across refresh
  - AuthContext + ProtectedRoute pattern every future authenticated page (02-05, 02-06) builds on
  - Centralized API client (src/lib/api.ts) with single-point 401-handling — the pattern all future API calls should reuse
affects: [02-05-calendar-grid-ui, 02-06-booking-form-ui]

tech-stack:
  added: [vite, react, react-router-dom, tailwindcss@4, "@tailwindcss/vite"]
  patterns:
    - "Central apiFetch() wrapper attaches Bearer token and clears it on any 401 — single enforcement point, not scattered per-call-site handling"
    - "AuthContext exposes isLoading explicitly; ProtectedRoute must not make its redirect decision until validation completes, or a valid session gets incorrectly bounced during the async window"
    - "Frontend never reconstructs a more specific error message than the backend provides for auth failures — protects the backend's deliberate email-enumeration mitigation from silent UI-layer regression"
    - "Dev-mode CORS avoided via a Vite proxy (/api → localhost:3000), not a backend change — production cross-origin deployment still needs real CORS config (tracked as a deferred issue, not silently forgotten)"

key-files:
  created:
    - frontend/ (full Vite scaffold)
    - frontend/src/lib/api.ts
    - frontend/src/context/AuthContext.tsx
    - frontend/src/routes/ProtectedRoute.tsx
    - frontend/src/pages/Login.tsx
    - frontend/src/pages/Dashboard.tsx
  modified: []

key-decisions:
  - "localStorage for JWT storage (not httpOnly cookie) — matches the backend's existing stateless-Bearer-token design; documented XSS tradeoff, not a silent default"
  - "No state-management library added — React Context is sufficient for this scope, matches project's simplicity-first discipline"
  - "CORS explicitly NOT added to the backend in this plan (would violate the no-backend-changes boundary) — logged as a deferred issue instead of silently deferred"

duration: "~1 session"
started: "2026-08-18"
completed: "2026-08-18"
---

# Phase 2 Plan 04: Frontend Scaffold + Login Summary

**The first visible, clickable surface in the entire project — a real login flow, verified live in an actual browser against the real backend, not just built and assumed to work.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1 session |
| Started | 2026-08-18 |
| Completed | 2026-08-18 |
| Tasks | 4 completed (scaffold, API client/AuthContext/ProtectedRoute, Login/Dashboard pages, human-verify checkpoint) |
| Files modified | Full new `frontend/` directory (6+ files), 0 backend files touched |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Frontend scaffold builds and runs | Pass | `npm run build` — zero TypeScript errors, clean dist/ output |
| AC-2: Login page authenticates against the real backend | Pass | Verified live in a real browser — correct credentials → redirect to /dashboard showing real userId/hotelId/role from GET /api/me |
| AC-3: Invalid credentials show an error, not a silent failure | Pass | User-confirmed: wrong credentials declined with visible error |
| AC-4: Unauthenticated access redirects to login | Pass | Confirmed via checkpoint flow (fresh visit lands on /login) |
| AC-5: Stored-but-invalid token is handled, not trusted blindly | Pass | User corrupted the real stored token via DevTools, refreshed — correctly bounced to /login, not a broken page |

## Accomplishments

- First frontend code in the project, live-verified in an actual browser by the user — not just built and assumed to work. Every prior plan (02-01/02-02/02-03) was API-only; this is the first thing anyone can actually click.
- Enterprise audit caught a real structural gap before APPLY: the original plan draft had a checkpoint describing Login.tsx/Dashboard.tsx as already built, with no task that actually specified building them. Fixed by adding an explicit Task 3.
- Same audit caught a subtler, higher-value gap: an unspecified frontend error message could have silently reopened the exact email-enumeration vulnerability 02-01's security audit closed at the backend layer, if a future implementer "improved" the UX by branching on response details. Closed with an explicit instruction never to reconstruct a more specific message than the backend provides — the third plan in this project where review caught a security guarantee not surviving consumption by a later layer.
- Self-verified everything automatable (build, dev-server boot, proxy wiring, wrong/right-credential HTTP responses) before handing the checkpoint to the user — the user then confirmed the genuinely-visual/interactive parts (form UX, redirect, refresh-persistence, corrupted-token handling, logout) live.
- CORS gap identified and explicitly logged as a deferred issue (STATE.md) rather than silently discovered later at deploy time — the plan correctly refused to scope-creep a backend fix into itself.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `frontend/` (Vite scaffold: package.json, vite.config.ts, tailwind.config.js, tsconfig.json, index.html, src/main.tsx, src/App.tsx) | Created | React+TS+Tailwind app, dev-proxy to backend, React Router shell |
| `frontend/src/lib/api.ts` | Created | Central fetch wrapper — Bearer token attachment, single-point 401 handling |
| `frontend/src/context/AuthContext.tsx` | Created | Auth state, login/logout, mount-time token validation with explicit isLoading gate |
| `frontend/src/routes/ProtectedRoute.tsx` | Created | Route guard — redirects to /login when unauthenticated, waits for isLoading |
| `frontend/src/pages/Login.tsx` | Created | Login form — generic error messaging (enumeration-safe), network-failure handling |
| `frontend/src/pages/Dashboard.tsx` | Created | Placeholder authenticated page — proves the full token round-trip |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| localStorage for JWT (not httpOnly cookie) | Matches backend's existing stateless-Bearer-token design; adding cookie support would be a backend change, out of scope | Documented XSS tradeoff — holds only as long as no `dangerouslySetInnerHTML`/unreviewed third-party scripts are introduced later (boundary note added) |
| No state-management library | Scope (one token + one form) doesn't need one; React Context is sufficient | Matches project's simplicity-first discipline, avoids premature abstraction |
| CORS deliberately not added here | Would violate this plan's own no-backend-changes boundary | Logged as a deferred issue (STATE.md) — required before real cross-origin deployment, not before this plan's own local-dev checkpoint |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Minor TS unused-import error caught by build, fixed immediately |
| Scope additions | 0 | — |
| Deferred | 0 (new) | — |

### Auto-fixed Issues

**1. [Structural] Unused `UnauthorizedError` import in AuthContext.tsx**
- **Found during:** First build attempt
- **Issue:** An early draft of `login()` explicitly threw `UnauthorizedError`; revised to let `apiFetch` throw it directly (avoiding a mislabeled generic-error case), which left the import unused
- **Fix:** Removed the unused import
- **Verification:** `npm run build` passes clean after the fix

### Deferred Items

None new beyond what the audit already logged as a standing deferred issue (CORS, tracked in STATE.md's Deferred Issues table, not this plan's own scope).

## Issues Encountered

None beyond the one auto-fixed TypeScript issue above. Unlike 02-01/02-03, no security-review/gsd-security-auditor pass was run — SPECIAL-FLOWS.md's literal triggers (payments, webhooks, auth, guest PII) don't require it for a pure frontend consumer of an already-secured API, and the plan itself flagged this as optional rather than silently skipping the question. The enterprise audit's own findings (email-enumeration regression risk, missing loading-state gate) served as the substantive review layer for this plan instead.

## Next Phase Readiness

**Ready:**
- A working, live-verified frontend foundation — 02-05 (calendar grid UI) can now build real Dashboard content on top of stable auth/routing
- The AuthContext/ProtectedRoute/apiFetch patterns are proven and directly reusable — 02-05 and 02-06 don't need to re-solve auth-state or 401-handling
- Test-account creation pattern (create-user.ts) confirmed to work end-to-end through the full frontend login flow, not just at the API level

**Concerns (for user review, not blocking):**
- CORS still not configured on the backend — tracked in STATE.md's Deferred Issues, must be picked up before real (non-dev-proxy) deployment
- localStorage token storage remains XSS-exposed in principle — accepted, documented tradeoff, consistent with the project's existing JWT-revocation accepted-risk pattern

**Blockers:**
- None.

**Phase 2 status:** 4 of an estimated 6 plans complete (auth API, calendar API, booking transaction, frontend scaffold+login). Calendar grid UI (02-05) and booking form UI (02-06) remain.

---
*Phase: 02-front-desk-booking-core, Plan: 04*
*Completed: 2026-08-18*
