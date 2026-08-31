# Enterprise Plan Audit Report

**Plan:** .paul/phases/07-pre-launch-gate/07-01-PLAN.md
**Audited:** 2026-08-28
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Conditionally acceptable, amended. This is the first plan in the project's history where the app actually runs behind a real reverse proxy, and the plan's original draft didn't account for what changes under that condition. Two must-have findings, both confirmed against the real code (not theoretical) and both would have broken the plan's own checkpoint the moment it ran. I would sign off on the amended version; the original would have failed its own live verification step.

## 2. What Is Solid

- **CORS designed as an explicit allowlist with fail-fast startup validation**, matching this project's own established convention (`JWT_SECRET`'s startup check in `src/lib/auth.ts`) rather than inventing a new pattern. No `origin: true`/`*` shortcut anywhere in the design.
- **Cost-conscious scope discipline**: correctly declined to stand up a production app tier before any real hotel exists, citing PROJECT.md's own Business Constraints rather than defaulting to "deploy everything because we can." This is the right call, not a corner cut — the plan states its reasoning rather than silently doing less.
- **Secret-handling boundary is correct in shape**: real values only ever go into Render's/Vercel's dashboards, never committed — AC-6 makes this explicit and testable via `git status`.
- **`prisma migrate deploy` (not `dev`) chosen for the production database** — correct instinct; `deploy` fails loudly on drift rather than silently generating a new migration against a target that must match exactly.

## 3. Enterprise Gaps Identified

**Rate-limiter bypass/lockout gap (confirmed real, not theoretical).** `src/routes/auth.ts`'s `loginLimiter` (Phase 2, `express-rate-limit`) uses the library's default `keyGenerator`, which keys on `req.ip`. Grepped this project's entire `src/` tree: no file anywhere calls `app.set("trust proxy", ...)`. The instant this app runs behind Render's reverse proxy, `req.ip` stops reflecting the real client and instead reflects Render's own proxy address for every single request — collapsing every visitor into one shared rate-limit bucket. Five login attempts from *anyone* locks out the entire staging environment for fifteen minutes. This would have surfaced during the plan's own checkpoint (a live login test) as an inexplicable, hard-to-diagnose failure.

**Secret-hygiene gap: JWT_SECRET reuse.** The plan's Task 2 as drafted said to "copy this project's existing staging values" for environment variables into Render's dashboard, with no exclusion named for `JWT_SECRET`. Copying it verbatim means local dev and the live, internet-reachable staging environment share one token-signing key — a compromised local `.env` (a laptop, a leaked dotfile, a careless `git add -A`) would let an attacker forge valid sessions against the real deployed app, not just against localhost.

## 4. Concrete Upgrades Required

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | No `trust proxy` config; existing login rate limiter breaks/globally-locks-out behind Render's proxy | Task 1 action + verify; new AC-7 | Added `app.set("trust proxy", 1)` to Task 1's `src/app.ts` change (exactly one trusted hop — not `true`, which would let a client forge its own `X-Forwarded-For`); Task 2's verify now includes a live multi-client rate-limit test |
| 2 | `JWT_SECRET` would be copied from local dev into staging verbatim | Task 2 action; new AC-8 | Task 2 now explicitly generates a fresh secret for staging using the project's existing generation command, pastes only into Render's dashboard; Task 2's verify checks it's distinct from local |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | CORS_ORIGIN validation described as "syntactically valid absolute URL" without a concrete check, and didn't guard against a trailing-slash entry that would silently never match a real Origin header | Task 1 action | Specified `new URL(entry)` for validation plus an explicit trailing-slash rejection |
| 2 | Task 2 offered "a local `.env` swap" as an acceptable way to run `prisma migrate deploy` against production — real risk of a forgotten/interrupted revert letting a later `npm run dev` write dev data into the empty production DB | Task 2 action | Removed the `.env`-swap option; inline env vars on a single command only, which persist nowhere |
| 3 | Human-verify checkpoint didn't warn about Render free-tier cold starts (~30-60s first-request delay after 15 min idle) — could be misread as a broken deploy during the live check | Checkpoint how-to-verify | Added a step 0 explaining the expected cold-start delay |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 1 | No production app-tier deployment | Already a deliberate, stated plan decision (cost-conscious, no real hotel exists yet) — correctly scoped, not a gap |
| 2 | No custom domain / CDN | Pre-real-launch concern; Render's/Vercel's default subdomains are sufficient for a staging environment used for demos |
| 3 | Render free-tier limitations (cold starts, eventual need to upgrade) | Acceptable at pre-revenue demo stage; revisit if staging becomes a heavier-traffic target or the actual production host |

## 5. Audit & Compliance Readiness

With both must-have fixes applied, this plan no longer introduces a self-inflicted denial-of-service against its own login flow, and staging's signing key is no longer entangled with a local developer machine's secret hygiene. Both gaps would have been genuinely embarrassing in front of a prospective hotel during a demo (the entire point of standing up staging) — closing them here, before the first real external visitor, is exactly what a pre-launch gate phase is for.

## 6. Final Release Bar

Before this ships: Task 1's `trust proxy` + CORS checks must pass, Task 2's rate-limiter-behind-proxy live test and JWT_SECRET-distinctness check must pass, and the human-verify checkpoint must be approved from a genuinely separate device. Remaining risk if shipped as amended: Render's free-tier cold starts remain a real (but expected, now-documented) UX rough edge for a cost-conscious demo environment — not a defect, a known tradeoff. I would sign my name to the amended plan.

---

**Summary:** Applied 2 must-have + 3 strongly-recommended upgrades. Deferred 3 items.
**Plan status:** Updated and ready for APPLY

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
