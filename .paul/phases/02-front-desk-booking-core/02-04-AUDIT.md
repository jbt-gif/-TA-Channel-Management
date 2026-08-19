# Enterprise Plan Audit Report

**Plan:** `.paul/phases/02-front-desk-booking-core/02-04-PLAN.md`
**Audited:** 2026-08-18
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Not acceptable as originally drafted — one genuine structural gap (a checkpoint verifying work no task actually specified building) would have left APPLY either improvising unspecified UI code or stalling at the checkpoint with nothing to verify. Conditionally acceptable as amended below. This is lower-stakes than 02-01/02-02/02-03 (no direct money/PII mutation, pure API consumer), but "lower-stakes" is not "no standards" — a login form is still the single most attractive target on this surface (credentials in transit through it) and the one place a careless frontend change could silently reopen a vulnerability the backend already closed.

## 2. What Is Solid

- **Bearer-token-in-header pattern is CSRF-immune by construction** — unlike cookie-based auth, there's no CSRF surface here at all; correctly not over-engineered with CSRF tokens this plan doesn't need.
- **The localStorage-vs-httpOnly-cookie tradeoff is explicitly documented with real reasoning** (matches the backend's actual stateless design, not a cookie-auth backend that was skipped), not silently defaulted.
- **Centralizing 401-handling in the API client** (Task 2) rather than per-call-site is the right shape — a single enforcement point for "stored token is invalid, clear it and redirect" is much harder to accidentally miss than scattering that logic across every fetch call.
- **The plan correctly refuses to scope-creep a CORS fix into itself** despite needing one eventually — respecting its own "no backend changes" boundary rather than quietly violating it. (The audit still requires this be *documented* as a known follow-up rather than silently absent — see below.)

## 3. Enterprise Gaps Identified

1. **Task-completeness gap: the checkpoint described already-built work with no task that built it.** The original plan had Task 1 (scaffold), Task 2 (API client/context/ProtectedRoute), then jumped straight to a `checkpoint:human-verify` whose `<what-built>` described `Login.tsx` and `Dashboard.tsx` as existing. No task specified their files, action, verify, or done criteria. This is exactly the failure mode PAUL's own plan-format guidance warns about: "if you can't specify Files + Action + Verify + Done, the task is too vague" — here it wasn't vague, it was *absent*.
2. **Silent email-enumeration regression risk at the UI layer.** The plan's AC-3 said "a visible error message appears" without specifying *what* message or where it comes from. The backend (02-01) went through a real security-auditor pass specifically to make wrong-password and nonexistent-email responses byte-identical, preventing enumeration. A frontend implementer following only "show an error" could easily "improve" the UX by branching on response details and re-introducing exactly that leak at the UI layer — the backend's fix would still be technically correct while the product as a whole leaks again.
3. **Missing loading-state gate on the auth-validation race.** `AuthContext` validates a stored token asynchronously via `GET /api/me` on mount. Without an explicit `isLoading` state that `ProtectedRoute` respects, a user with a genuinely valid token can be incorrectly redirected to `/login` during that async window — a real correctness bug against the plan's own AC-4/AC-5, not just a cosmetic flicker.
4. **No distinction between "wrong credentials" and "server unreachable."** The plan didn't specify handling for a network-level failure (fetch throwing) separately from a 401 response. An unhandled rejection here produces exactly the kind of "silent failure path" PROJECT.md's own Technical Context calls out as elevated-risk given the non-technical founder can't independently spot it.
5. **CORS is a real, near-term gap this plan cannot fix within its own boundaries but must not let go unrecorded.** The dev-proxy sidesteps it locally, but the moment the frontend deploys to a different origin than the backend (which PROJECT.md's own deployment plan requires), every API call breaks until CORS is configured backend-side. Underspecified follow-up work is still a risk per this audit's own mandate to treat anything underspecified as a risk.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Missing task for Login.tsx/Dashboard.tsx | `<tasks>` | Added Task 3 (auto) with explicit files/action/verify/done, inserted before the checkpoint it was missing under |
| 2 | Silent email-enumeration regression risk | Task 3 `<action>` | Explicit instruction: display the backend's generic message verbatim (or an equally generic fixed string), never infer/construct a more specific message from response details |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Missing loading-state gate on auth validation | Task 2 `<action>` | Added explicit `isLoading` requirement on AuthContext; ProtectedRoute must not redirect until validation completes |
| 2 | No network-failure handling distinct from 401 | Task 3 `<action>` | Added explicit separate-catch instruction for network-level failures with a distinct user-facing message |
| 3 | CORS follow-up not recorded | `<boundaries>` SCOPE LIMITS | Added explicit note: known, deliberately out-of-scope-here, must not be silently forgotten before real deployment |
| 4 | localStorage/XSS tradeoff could silently erode | `<boundaries>` SCOPE LIMITS | Added explicit constraint: the tradeoff holds only as long as no `dangerouslySetInnerHTML`/unreviewed third-party scripts are introduced later |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 1 | Login form visual polish / loading-spinner styling | Cosmetic, not a correctness or security concern; doesn't affect any AC |
| 2 | Toast/notification library selection for error display | Plain inline error text satisfies AC-3 as written; a library is a nice-to-have, not required by this plan's scope |

## 5. Audit & Compliance Readiness

- **Silent failures:** The two real silent-failure paths identified (network-error crash, loading-state race) are both closed by this amendment. No known silent-failure path remains in this plan's scope.
- **Security-regression risk:** The email-enumeration risk was the most consequential finding — closed. This is the third plan in this project where a review pass caught a regression risk against an already-established security guarantee (after 02-01's own timing fix and 02-03's guest.email injection) — worth noting as a pattern: security guarantees established in one layer need explicit instructions to survive being consumed by a later layer, they don't propagate automatically.
- **Post-incident reconstruction:** N/A for this plan — no financial or PII-mutating operations occur here (pure read of an existing, already-audited login endpoint).
- **What would fail a real audit if shipped unamended:** The missing task (finding 1) would have produced either stalled execution or improvised, unreviewed UI code at APPLY time — a process-integrity failure, not just a quality one.

## 6. Final Release Bar

**What must be true before this plan ships (APPLY):**
- Task 3 actually implements the specified error-message discipline (generic message, verbatim or equally generic) — not just present in the plan text.
- The `isLoading` gate is implemented and the checkpoint's manual verification step 7 (corrupt the token, refresh) is genuinely tested, not assumed.
- Human checkpoint approved after actually running the flow in a browser against the real backend — this plan is unusual in this project for being the first one a human must literally look at.

**What risks remain if shipped exactly as amended:**
- CORS is still not configured — deliberately deferred, documented, not blocking this plan, but must be picked up before or during whichever plan first handles real deployment.
- localStorage token storage remains XSS-exposed in principle — an accepted, documented tradeoff consistent with the project's existing JWT-revocation accepted-risk pattern, not a gap.

**Sign-off:** I would sign this plan as amended for its stated scope (local dev-proxy environment, first frontend surface in the project). The CORS gap is the one item I'd want written down somewhere more permanent than this audit report before deployment planning starts — recommend it gets added to STATE.md's Deferred Issues table during UNIFY, not just left in this AUDIT.md.

---

**Summary:** Applied 2 must-have + 4 strongly-recommended upgrades. Deferred 2 items.
**Plan status:** Updated and ready for APPLY.

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
