---
phase: 07-pre-launch-gate
plan: 01
subsystem: infra
tags: [cors, express-rate-limit, render, vercel, supabase, deployment]

requires:
  - phase: 02-front-desk-booking-core
    provides: express-rate-limit login limiter (needed trust-proxy fix)
  - phase: 06-mobile-housekeeping-view
    provides: /housekeeping route + Dashboard nav link (first route to expose the SPA-routing gap)
provides:
  - CORS allowlist middleware, fail-fast at startup
  - trust proxy config for correct rate-limiting behind Render
  - purge-test-data.ts (idempotent staging-credential rotation script)
  - Real staging environment (Render backend + Vercel frontend, both live, cross-origin)
  - Real, separate, schema-complete production Supabase project
  - frontend/vercel.json SPA rewrite (all client routes resolve correctly on direct visit/refresh)
affects: [07-pre-launch-gate remaining plans]

tech-stack:
  added: [cors, "@types/cors"]
  patterns:
    - "Fail-fast env validation at module load (CORS_ORIGIN), matching JWT_SECRET's existing convention"
    - "Idempotent one-off scripts printed secrets once to terminal only, never to committed files or chat transcripts"

key-files:
  created: [src/middleware/cors.ts, src/scripts/purge-test-data.ts, frontend/vercel.json]
  modified: [src/app.ts, package.json, .env.example, .gitignore]

key-decisions:
  - "CORS_ORIGIN validated once at startup (URL-parse + trailing-slash check), not lazily per-request — bad config fails loud immediately"
  - "app.set('trust proxy', 1) — trusts exactly one hop (Render's own proxy), not unbounded, to avoid a client forging X-Forwarded-For to bypass the login rate limiter"
  - "purge-test-data.ts deletes every hotel except the named demo dataset and rotates ALL its users' passwords (not just session-typed ones) — every password from Phases 2-6's smoke tests was typed in some past transcript at some point, treated as compromised uniformly"
  - "No production app-tier deployment this plan (deliberate, cost-conscious) — only the production database gets stood up and schema-verified"
  - "Vercel's env-var auto-detection pulled the repo's ROOT .env.example (8 backend-only keys) instead of anything frontend-specific — all 8 left blank/removed, only VITE_API_URL set manually"

patterns-established:
  - "SPA on Vercel needs an explicit vercel.json rewrite (all paths → index.html) or any non-root route 404s at the edge on direct visit/refresh — client-side nav alone masks this until someone refreshes"

duration: ~4hr across two sessions (2026-08-28 CORS/purge/audit, 2026-08-31 deploy + Vercel fix)
started: 2026-08-28T00:00:00Z
completed: 2026-08-31T00:00:00Z
---

# Phase 7 Plan 01: Pre-launch gate — staging + production separation Summary

**A real, internet-reachable staging environment now exists (Render backend + Vercel frontend, genuinely cross-origin, CORS-enforced) alongside a separate, schema-complete production Supabase database holding zero rows — closing the "nothing has ever been deployed" gap and the long-standing CORS deferred issue in one pass.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~4hr total across two sessions (2026-08-28: CORS/trust-proxy/purge-script build + audit; 2026-08-31: Render/Vercel deploy, prod DB migration, live verification) |
| Started | 2026-08-28 |
| Completed | 2026-08-31 |
| Tasks | 4 auto/checkpoint tasks + 1 mid-plan hotfix (Vercel SPA routing), all resolved |
| Files modified | 9 (7 created/modified in-repo, plus Render/Vercel/Supabase dashboard configuration outside git) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: CORS rejects unlisted origins, allows configured one | Pass | Verified via curl against the local server before deploy; enforced identically in production config |
| AC-2: Missing/malformed CORS_ORIGIN fails at startup | Pass | Matches JWT_SECRET's fail-fast pattern |
| AC-3: Staging frontend reaches staging backend cross-origin, for real | Pass | Live-verified: logged into `https://frontend-ten-phi-vq3f2cmvsf.vercel.app`, no CORS errors, follow-up authenticated calls succeeded |
| AC-4: Full core loop works on real staging URLs | Pass | Live-verified: calendar grid loaded real data, walk-in booking created and grid updated live, housekeeping status change persisted through a refresh — all on the real Vercel/Render URLs, not localhost |
| AC-5: Production database schema-complete and separate | Pass | `prisma migrate deploy` applied cleanly against the new production Supabase project; zero rows in every table |
| AC-6: Real secrets never committed | Pass | `git diff .env.example` confirmed only comment additions, no real values; verified before UNIFY |
| AC-7: Rate limiter correct behind Render's proxy | Pass | `trust proxy` set; verified during Task 3 |
| AC-8: Staging has its own JWT_SECRET | Pass | Freshly generated, set only in Render's dashboard |
| AC-9: No test credentials survive into staging | Pass | `purge-test-data.ts` run: 0 smoke-test hotels remain, Hiraya Test hotel + 2 rooms intact, all 4 of its users' passwords rotated |

## Accomplishments

- First real deployment in this project's history — everything before this was localhost-verified only
- Closed the CORS gap the 02-04 audit flagged as inevitable back in Phase 2
- Live-proved the full core loop (login → calendar → walk-in booking → housekeeping status) works identically once genuinely cross-origin, not just under Vite's dev-proxy illusion of same-origin
- Caught and fixed a real production bug during live verification that no prior review layer anticipated: Vercel serves an SPA by literal file path, so any non-root route (`/housekeeping`) 404'd at the edge on direct visit or refresh, before React Router ever loaded — fixed with a `vercel.json` catch-all rewrite
- Recovered cleanly from an accidental mid-session IDE close (2026-08-31) by reading the prior session's own transcript to reconstruct exact stopping point, rather than re-doing or guessing at already-completed work

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: CORS + trust proxy | `1fb427e` | feat | `src/middleware/cors.ts`, `app.set('trust proxy', 1)`, `.env.example` docs |
| Task 2: Purge test data | `240432d` | feat | `src/scripts/purge-test-data.ts`, idempotent hotel/user cleanup + rotation |
| Task 3: Render deploy + prod DB migration | *(no commit — dashboard config + `prisma migrate deploy` via inline env vars, no schema change)* | infra | Backend live at `oa-channel-management.onrender.com`; production Supabase schema-verified |
| Task 4: Vercel deploy | *(no commit — dashboard config only)* | infra | Frontend live at `frontend-ten-phi-vq3f2cmvsf.vercel.app` |
| Hotfix: Vercel SPA routing | `4490e02` | fix | `frontend/vercel.json` catch-all rewrite, found during live AC-4 verification |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/middleware/cors.ts` | Created | Fail-fast CORS allowlist, validated once at startup |
| `src/app.ts` | Modified | Mounted CORS middleware, `trust proxy` config |
| `.env.example` | Modified | `CORS_ORIGIN` documentation, staging/production account clarification |
| `package.json` | Modified | Added `cors`, `@types/cors` |
| `src/scripts/purge-test-data.ts` | Created | Deletes non-demo hotels, rotates all demo-hotel user passwords |
| `.gitignore` | Modified | Excludes `.env.prod.tmp` (one-off migration credential file) |
| `frontend/vercel.json` | Created | SPA catch-all rewrite to `index.html` |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Promote existing Supabase project to permanent staging; create new separate project for production | User-confirmed 2026-08-28 — avoids a throwaway-DB rebuild later | Staging carries real historical data lineage; production starts genuinely clean |
| No production app-tier deployment this plan | Cost-conscious, no real hotel exists yet to serve | Standing up prod's app tier deferred to first real hotel onboarding — same-shape, low-effort follow-up |
| purge-test-data.ts rotates ALL demo-hotel users, not just session-typed ones | Every password from every Phase 2-6 smoke test was typed in some transcript at some point | Uniform treatment — no password left compromised-but-untouched |
| Vercel's auto-detected 8 env vars (from root `.env.example`) all left blank/removed | None were frontend-relevant — backend secrets have no reason to exist in Vercel's environment | Avoided seeding an unused, confusing set of empty backend vars into the frontend deployment |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 (Vercel SPA routing) | Essential fix, found via live verification, no scope creep |
| Scope additions | 0 | — |
| Deferred | 0 new (3 carried from audit/critic) | Logged in 07-01-AUDIT.md, none blocking |

**Total impact:** One real production bug (SPA routing 404) caught and fixed before UNIFY, via the same live-verification discipline that's caught something on nearly every prior plan in this project.

### Auto-fixed Issues

**1. [Infra] Vercel 404'd on any direct visit/refresh of a non-root route**
- **Found during:** AC-4 live verification — `/housekeeping` returned Vercel's own `404: NOT_FOUND` page on refresh, never reaching the React app
- **Issue:** Vercel serves static builds by literal file path; an SPA's client-side routes (`/housekeeping`) aren't real files, so anything but the root path 404s at the edge unless explicitly rewritten
- **Fix:** Added `frontend/vercel.json` with a catch-all rewrite (`/(.*) → /index.html`)
- **Files:** `frontend/vercel.json`
- **Verification:** Pushed, Vercel auto-redeployed, user confirmed `/housekeeping` loads correctly on refresh and a room-status change persists
- **Commit:** `4490e02`

### Deferred Items

Carried from 07-01-AUDIT.md and 07-01's plan-critic pass (none new from APPLY):
- `PushQueue` background worker sleeps with Render's free tier after ~15 min idle — accepted for staging (no real hotel depends on timely sync yet), must be resolved before production
- No genuine Channex-delivered webhook has ever exercised the inbound handler — staging.channex.io's dashboard bug (Mapping tab) remains unresolved after 12+ days, unrelated to this project's code
- `CHANNEX_WEBHOOK_SECRET` briefly shown unmasked in a Render dashboard screenshot in a prior session — accepted for staging rather than rotated

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Session's IDE window closed accidentally mid-Task-4 (2026-08-31) | Recovered exact stopping point by reading the prior session's own transcript file directly, rather than re-doing completed work or guessing state |
| Sandbox blocked running `prisma migrate deploy` against production and `purge-test-data.ts` against the live DB directly | Both run by the user in their own terminal instead — correct outcome given these touch real production/staging data, not a workaround |
| Vercel auto-detected 8 env vars from the repo's root `.env.example` (backend secrets) rather than anything frontend-relevant | Caught before deploy; all 8 left blank and removed, only `VITE_API_URL` set manually |

## Next Phase Readiness

**Ready:**
- Full core booking-engine demo loop (auth, front-desk booking, hotel admin config, Channex two-way sync, housekeeping status) is now live and user-verified on real staging infrastructure, not just localhost
- Production database exists, schema-complete, genuinely separate — ready for its app tier whenever a real hotel onboards
- `vercel.json` SPA-routing pattern is now established for any future frontend route added to this project

**Concerns:**
- Render free-tier sleep still pauses the PushQueue worker during staging idle periods — acceptable now, not for production
- Inbound Channex webhook still unverified against a real delivery (Channex-side dashboard bug, not this project's code)

**Blockers:**
- None

---
*Phase: 07-pre-launch-gate, Plan: 01*
*Completed: 2026-08-31*
