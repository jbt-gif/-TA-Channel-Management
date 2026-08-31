---
phase: 07-pre-launch-gate
plan: 02
subsystem: infra
tags: [sentry, uptimerobot, error-monitoring, observability, security-review]

requires:
  - phase: 07-01
    provides: real staging URLs (Render backend, Vercel frontend) to monitor
provides:
  - "@sentry/node wired into every route's real catch-and-500 convention (not just Express's unused error middleware)"
  - "@sentry/react wired into the frontend, with error boundary + global handler capture"
  - PushQueue worker Sentry capture at both catch sites (whole-tick and per-row), de-duped 15min/message
  - "/health now runs a real DB query, 503 on failure instead of a static 200"
  - UptimeRobot monitoring both real staging URLs with a working email alert contact
affects: [07-pre-launch-gate remaining plans, any future route added to this project]

tech-stack:
  added: ["@sentry/node", "@sentry/react"]
  patterns:
    - "Sentry.captureException(err) added alongside the existing console.error(err) in every route's catch block — this codebase never calls next(err), so Express's error middleware alone never sees a route error"
    - "sendDefaultPii: false suppresses request/header capture entirely rather than relying on redaction — live-verified: a captured event with a deliberately-attached fake Authorization header showed zero Request/Headers context at all"
    - "Rate-limited/de-duped Sentry capture at high-frequency failure sites (7s worker tick) to avoid burning the free-tier quota on a persistent failure"

key-files:
  created: [src/lib/sentry.ts]
  modified: [src/server.ts, src/app.ts, src/lib/pushQueueWorker.ts, src/routes/auth.ts, src/routes/bookings.ts, src/routes/channexWebhook.ts, src/routes/hotel.ts, src/routes/ratePlans.ts, src/routes/rooms.ts, src/routes/roomTypes.ts, src/routes/syncStatus.ts, .env.example, frontend/src/main.tsx]

key-decisions:
  - "Route-level Sentry.captureException in each route's own catch block is the primary capture mechanism, not Sentry's Express error middleware — verified via grep that no route in this codebase ever calls next(err)"
  - "PushQueue worker capture wired at BOTH catch sites (outer tick + processRow's inner catch) since routine per-hotel push failures are absorbed inside processRow and never reach the outer catch"
  - "sendDefaultPii: false + beforeSend header stripping on both SDKs — live-verified against a real captured event, not just configured and assumed"
  - "Local testing against the real SENTRY_DSN (same value as Render's) used for the backend live-verification step, instead of a redeploy-test-revert-redeploy cycle against Render itself — Render's own boot log already confirmed 'Sentry error monitoring enabled' with the live DSN, so this avoided two unnecessary remote deploys for equivalent proof"

patterns-established:
  - "A directly-typed `throw` in Chrome DevTools console does not reliably trigger window.onerror the same way real script execution does — use a setTimeout-wrapped throw when manually testing global error handlers from DevTools"

duration: ~1 session (2026-08-31, split across two sittings same day)
started: 2026-08-31T00:00:00Z
completed: 2026-08-31T00:00:00Z
---

# Phase 7 Plan 02: Error + uptime monitoring Summary

**A real backend or frontend error is now visible in Sentry within seconds instead of discovered by a hotel calling to complain, and both real staging URLs are actively uptime-monitored with a working email alert — both verified live against actual captured events and a real test alert, not just configured and assumed.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~1 session, split across two sittings on 2026-08-31 |
| Started | 2026-08-31 |
| Completed | 2026-08-31 |
| Tasks | 2 auto tasks + 1 checkpoint:human-action + 1 auto (live verification), all resolved |
| Files modified | 13 in-repo, plus Render/Vercel/Sentry/UptimeRobot dashboard configuration outside git |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Backend route error reaches Sentry via its own catch block | Pass | Live-verified: temporary debug route (never committed) triggered a real 500 locally against the real SENTRY_DSN, captured with correct request path/method |
| AC-1b: Middleware-level error reaches Sentry as a backstop | Pass | Same trigger propagated through `Sentry.setupExpressErrorHandler` since the debug route itself had no try/catch, proving the backstop path independently |
| AC-2: Frontend runtime error reaches Sentry | Pass | Live-verified on the real deployed site: a `setTimeout`-wrapped throw produced a `200` envelope request to Sentry's ingest endpoint, captured event confirmed in dashboard |
| AC-3: PushQueue worker error reaches Sentry at both catch sites | Pass | Code-verified during Task 1 per plan-critic's findings; both `processRow`'s inner catch and the outer tick catch wired |
| AC-4: Missing/malformed SENTRY_DSN does not crash the server | Pass | Verified during Task 1 build/qualify |
| AC-5: Uptime monitors correctly track the real staging URLs | Pass | Both monitors confirmed "Up" live: Render `/health` (91% 7-day uptime, one real cold-start incident already self-resolved), Vercel frontend (100% 7-day uptime, 0 incidents) |
| AC-6: Alert contact actually delivers | Pass | UptimeRobot's "Test Notification" sent and confirmed received in inbox |
| AC-7: No real secrets committed | Pass | `git diff .env.example` empty (placeholder already committed in Task 1); `git status`/`git diff src/app.ts` confirmed clean of the temporary debug route after testing |
| AC-8: Guest PII and auth tokens never leave the system via Sentry | Pass | Live-verified on both sides: backend event with a deliberately-attached fake `Authorization` header showed zero Request/Headers data in Sentry (checked in-dashboard and via raw JSON search — 0 matches for the fake token string); frontend event's Breadcrumbs showed three real authenticated `Fetch` calls with only method/URL/status, no header data |
| AC-9: Persistently-failing worker tick does not exhaust Sentry's quota | Pass | De-dupe logic verified via an isolated 5-assertion test script during Task 1 (all passed) |
| AC-10: /health reflects real DB connectivity | Pass | Verified live: `/health` on both local and deployed instances runs `SELECT 1` before responding |

## Accomplishments

- First real, live-verified error-monitoring pipeline in this project — proven against actual captured Sentry events and a real delivered alert email, not just "it should work"
- Closed a real architectural gap the plan-critic pass caught pre-APPLY: this codebase's routes never call `next(err)`, so Express's error middleware alone would have seen zero real route errors — route-level capture is the actual primary mechanism now
- Live-proved `sendDefaultPii: false` suppresses request/header capture entirely (not just redacts) — the strongest possible result for the AC-8 compliance requirement
- security-review of the `auth.ts`/`channexWebhook.ts` diff (required per SPECIAL-FLOWS.md's webhook/auth trigger) found zero HIGH/MEDIUM findings — the diff is mechanically identical to the existing `console.error` calls, just also forwarded to Sentry
- Surfaced and diagnosed an unrelated stray Vercel project (pointed at the repo root instead of `frontend/`, failing every build since initial setup) during live verification — flagged for cleanup, not a blocker, not caused by this plan

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Backend Sentry wiring | `38f866e` | feat | `src/lib/sentry.ts`, route-level + worker capture, `/health` DB check, PII scrubbing, de-dupe |
| Task 2: Frontend Sentry wiring | `37062a3` | feat | `frontend/src/main.tsx` Sentry init + ErrorBoundary + breadcrumb scrubbing |
| Checkpoint: Sentry + UptimeRobot accounts | *(no commit — account creation only)* | infra | Sentry project, UptimeRobot account + 2 monitors + email alert contact |
| Task 4: Wire DSNs, live verify | *(no commit — dashboard env vars + live testing only)* | infra | `SENTRY_DSN` (Render), `VITE_SENTRY_DSN` (Vercel), both redeployed and verified |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/sentry.ts` | Created | Backend Sentry init, fail-open on missing/malformed DSN, PII scrubbing |
| `src/server.ts` | Modified | Sentry init as first import, before `app.js` |
| `src/app.ts` | Modified | Deep `/health` DB check, `Sentry.setupExpressErrorHandler` backstop |
| `src/lib/pushQueueWorker.ts` | Modified | Sentry capture at both catch sites, de-dupe helper |
| `src/routes/{auth,bookings,channexWebhook,hotel,ratePlans,rooms,roomTypes,syncStatus}.ts` | Modified | `Sentry.captureException(err)` in each real catch-and-500 block |
| `.env.example` | Modified | `SENTRY_DSN` placeholder + comment |
| `frontend/src/main.tsx` | Modified | Sentry init, ErrorBoundary, breadcrumb header scrubbing |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Local backend testing against the real SENTRY_DSN instead of a Render redeploy-test-revert cycle | Render's own boot log already confirmed Sentry initialized correctly with the live DSN; testing locally against the identical DSN gave equivalent proof without two unnecessary redeploys | Faster live verification, same evidentiary strength |
| Temporary debug route for the backend error trigger, reverted before anything else happened | No existing route naturally exposed an unhandled path — every route in this codebase is tightly input-validated from prior security passes | Matches the plan's own explicit fallback allowance; confirmed clean via `git diff` before proceeding |
| `setTimeout`-wrapped throw for the frontend manual test | A directly-typed `throw` in DevTools console doesn't reliably trigger `window.onerror` | Real, reproducible trigger; documented as a pattern for future manual testing |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 new | — |

**Total impact:** None — plan executed as audited/critiqued, no new gaps found during live verification.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Vercel's env var only takes effect in a build that ran after it was added (Vite bakes vars at build time) | Caught via checking deployment timestamps against the env-var-added timestamp; triggered a manual redeploy |
| A directly-typed `throw` in Chrome DevTools console didn't trigger a Sentry-captured event on the first two attempts | Diagnosed via Network tab (no request fired) and `window.__SENTRY__` (SDK confirmed loaded) — switched to a `setTimeout`-wrapped throw, which worked immediately |
| A stray, unrelated Vercel project (pointed at repo root, failing every build since initial setup) surfaced during live verification | Confirmed unrelated to this plan or tonight's changes (failing since before this session started); flagged for the user to delete at their convenience, not touched |
| A stray backend process from an earlier failed background-launch attempt was left holding port 3000 | Identified via `netstat`, killed via `taskkill`, before the real local test run |

## Next Phase Readiness

**Ready:**
- Error monitoring and uptime monitoring are both live and independently proven against real staging infrastructure
- `07-03` (backup restore drill) and `07-04` (security review + goal-backward `gsd-verifier` audit) remain, per the phase split logged 2026-08-28

**Concerns:**
- Whether Render's 5-minute UptimeRobot pings incidentally keep the free-tier container from sleeping (noted as informational in the plan, not a hard gate) — not yet observed over a long enough idle window to confirm either way
- Stray duplicate Vercel project (repo-root-scoped, failing every build) not yet cleaned up — zero functional impact, purely cosmetic clutter in the Vercel dashboard

**Blockers:**
- None

---
*Phase: 07-pre-launch-gate, Plan: 02*
*Completed: 2026-08-31*
