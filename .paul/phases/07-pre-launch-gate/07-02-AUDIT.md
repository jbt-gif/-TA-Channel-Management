# Enterprise Plan Audit Report

**Plan:** .paul/phases/07-pre-launch-gate/07-02-PLAN.md
**Audited:** 2026-08-31
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Not enterprise-ready as originally drafted — conditionally acceptable once amended. The plan's overall shape is sound (correct dependency on 07-01's real URLs, correct reuse of an already-proven pattern from sibling projects, correctly scoped boundaries against creep into 07-03/07-04's territory), but as drafted it would have shipped a monitoring subsystem that itself created a real compliance exposure (raw guest PII and JWT tokens potentially leaving the system via Sentry's default capture behavior) and a real risk of silently defeating its own purpose (a persistent worker failure exhausting Sentry's free-tier quota within hours, going dark for the rest of the month). I would not have signed off on this as drafted. Amended, I would.

## 2. What Is Solid

- **AC-4's explicit fail-open design** (missing `SENTRY_DSN` must not crash the server) is a genuine architectural decision, correctly reasoned against this project's own established fail-fast convention (`CORS_ORIGIN`/`JWT_SECRET`) — the plan explains *why* this one is different (observability, not a security boundary) rather than leaving the inconsistency unexplained.
- **Task 1 targets the actual existing silent-failure point** (`pushQueueWorker.ts`'s console.error-only catch) instead of vague "add monitoring everywhere" language — grounded in a real, previously-identified gap (07-01's own Deferred Issues list), not invented scope.
- **`depends_on: ["07-01"]` is a genuine dependency**, correctly justified (the uptime monitors point at 07-01's real URLs) — not the reflexive chaining this project's own anti-pattern guidance warns against.
- **Boundaries correctly exclude Slack/PagerDuty, session-replay, and the two later Phase 7 plans' scope** — matches this project's established discipline of not absorbing adjacent work into one plan.
- **Checkpoint bundling** (Sentry + UptimeRobot account creation in one blocking step) follows 07-01's own established precedent for genuinely-unavoidable browser-gated account creation.

## 3. Enterprise Gaps Identified

1. **Missing PII/auth-header scrubbing before third-party transmission.** Sentry's default request/breadcrumb capture behavior can include HTTP headers (including `Authorization: Bearer <JWT>`) and request bodies (which, for this project, routinely carry guest name/email/phone). PROJECT.md's Compliance Constraints explicitly require guest data to be "treated with the same discipline as if [a formal regime] applied" — nothing in the original plan addressed what Sentry actually captures, on either the backend (Express request data) or frontend (fetch/XHR breadcrumbs, given `frontend/src/lib/api.ts` sets an Authorization header on every authenticated call).

2. **Test-error methodology risked shipping stray debug code.** The original Task 4 suggested "a throwaway route" for triggering a live backend error with no explicit requirement that it be reverted and verified absent before the task closes. A forgotten debug route in a real, internet-reachable environment is exactly the kind of latent risk this project's own prior audits have repeatedly caught in other forms (e.g. 07-01's purge-test-data task existed for the same class of concern — residue left in a live environment).

3. **No mitigation against the worker's own tick interval burning the monitoring budget.** `PushQueueWorker`'s tick runs every 7 seconds (PROJECT.md Key Decisions). An unmitigated persistent failure — plausible, since this is exactly the failure mode monitoring exists to catch — would generate roughly 12,300 events/day, exhausting Sentry's 5,000-event/month free tier in under 3 hours. After quota exhaustion, Sentry silently drops further events. This would mean the monitoring system goes blind precisely when it's needed most, directly undermining PROJECT.md's stated Success Metric ("zero silent failures... every failure visibly logged and alerted").

4. **AC-4 only covered the unset-DSN case, not a malformed/unreachable one.** Both are the same underlying failure class (Sentry initialization shouldn't be able to take the server down), but only one was actually specified as a test condition.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Guest PII / JWT tokens could leave the system unredacted via Sentry (backend + frontend) | New AC-8; Task 1 action/verify; Task 2 action/verify; Task 4 action | Requires `sendDefaultPii: false` (or version-equivalent) + explicit `beforeSend`/`beforeBreadcrumb` header stripping on both SDKs; Task 4 now requires actually inspecting a captured event to confirm no raw Authorization header or guest PII field is present, not just that an event arrived |
| 2 | Throwaway debug route for test-error triggering had no revert/verification requirement | Task 4 action, boundaries | Task 4 now prefers reusing an existing endpoint's genuine error path; if a temporary route/component is used, it must be confirmed reverted via `git status` before the task is marked done; added as an explicit boundary |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Worker's 7-second tick could exhaust Sentry's free-tier quota during a real persistent failure, silently defeating this plan's purpose | New AC-9; Task 1 action/verify | Requires an in-memory de-dupe/rate-limit on the worker's `Sentry.captureException` call (first occurrence + at most one re-capture per 15 minutes per distinct error), while keeping the existing per-tick `console.error` unthrottled |
| 2 | AC-4 didn't cover the malformed/unreachable-DSN case, only the unset case | AC-4, Task 1 verify | Broadened AC-4's Given clause and Task 1's verify step to cover both cases explicitly |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 1 | No formal on-call/escalation policy beyond the founder's own email | Proportionate to a solo, pre-revenue operation with no staff yet — this project's own established pattern (e.g. accountability-field decisions) consistently scales controls to actual team size rather than adding unused ceremony. Revisit once a team exists. |
| 2 | No Sentry release-tracking / frontend source-map upload for readable production stack traces | Improves debugging ergonomics, not release-blocking for basic error visibility — the plan's stated goal (know that something broke) is satisfied without it. Add later once error volume/debugging need justifies the setup effort. |
| 3 | No structured "who acknowledged this alert" accountability trail | Not needed at single-founder scale; mirrors this project's own established convention of not over-building accountability trails ahead of the actual multi-user need that would require them. |

## 5. Audit & Compliance Readiness

**Before amendment**, this plan would have failed a real compliance review specifically because it introduced a new third-party data-egress path (Sentry, a SaaS outside this project's own infrastructure) without addressing what data actually crosses that boundary — a materially worse position than doing nothing, since it would create an new, undocumented PII exposure surface while appearing to be a pure safety improvement.

**After amendment**, the plan produces defensible evidence for both of its stated purposes: (a) a captured Sentry event is a genuine audit artifact of a real failure, now with an explicit requirement to verify it doesn't itself constitute a data leak, and (b) the worker's existing `console.error`/`lastError` DB write remains the primary accountable record (unchanged, per this project's established convention), with Sentry capture as an additive alert layer rather than a replacement — no risk of the new monitoring layer silently superseding or corrupting an existing accountability mechanism.

Ownership is appropriately scoped to the founder alone (correct given the project's actual current team size, per PROJECT.md's Target Users and Business Constraints sections) — not flagged as a gap.

## 6. Final Release Bar

**Must be true before this plan ships:**
- A real captured Sentry event (backend and frontend) has been manually inspected and confirmed free of raw Authorization headers and raw guest PII — not just "an event arrived," per Task 4's amended verification
- The worker's Sentry-capture de-dupe/rate-limit behavior has been exercised (simulated repeated failure) and confirmed to not spam-capture every 7 seconds
- No temporary debug route/component from live-error testing survives in a commit

**Risks that remain even if shipped as amended:**
- Sentry's exact default-capture behavior varies by SDK major version; this plan correctly defers to "confirm against the installed version's current docs" rather than hardcoding an API surface that may be stale by APPLY time — this is appropriate hedging, not a gap, but it does mean APPLY-time verification carries real weight and must not be treated as a formality
- UptimeRobot's free tier could change terms in the future (a business risk, not a technical one, and explicitly out of this plan's scope)

**Would I sign my name to this system, amended:** Yes, for this plan's stated scope (observability plumbing at pre-revenue, single-pilot-hotel scale). The amendments close the two gaps that would have made this monitoring layer a net-new liability rather than a net safety improvement.

---

**Summary:** Applied 2 must-have + 2 strongly-recommended upgrades. Deferred 3 items.
**Plan status:** Updated and ready for APPLY (pending `paul-plan-critic` pass, also `required: true` per config.md)

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
