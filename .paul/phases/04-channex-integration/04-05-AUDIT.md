# Enterprise Plan Audit Report

**Plan:** .paul/phases/04-channex-integration/04-05-PLAN.md
**Audited:** 2026-08-24
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Conditionally acceptable, amended. As originally written, the plan built a working retry mechanism but did so in a way that would have quietly undermined two things this project has explicitly committed to elsewhere: a real accountability trail on human-triggered state changes (already the standing convention on every other financially/operationally-relevant record — `Booking`, `Payment`, `RoomType`, `RatePlan`), and PROJECT.md's own named Success Metric of zero silent failures. The plan also under-delivered on its own stated goal — a failure list keyed by raw cuids isn't something a hotel admin can actually act on. All three are fixed below. I would sign off on the amended version; I would not have signed the original, not because the API shape was wrong, but because a "fix a broken sync" feature that erases the evidence of what broke and lets anyone loop past the system's own circuit breaker is a worse failure mode than the one it's meant to solve.

## 2. What Is Solid

- **Tenant isolation discipline.** Every query is scoped `{ id, hotelId }`, never a bare `{ id }` lookup — and the plan explicitly calls for a byte-identical 404 across "belongs to another hotel" and "doesn't exist," matching this project's established anti-enumeration pattern from `roomTypes.ts`/`bookings.ts`. This is exactly the discipline 02-02's own audit had to teach this codebase; good that it's now reflexive.
- **Correct read/write boundary with 04-04.** This plan reads and resets `PushQueue` rows but never touches `pushQueueWorker.ts`'s own claim/compute/push logic — the worker remains the single owner of how a push actually happens, this plan only decides *whether one should be attempted again*. Clean separation of concerns.
- **Honest scoping of "staff alert."** Rather than quietly inventing an email/SMS notification system nothing else in this project has, the plan states plainly that a dashboard badge is the interpretation being shipped, names why (no notification infra exists, not asked for), and flags it as revisitable. That's the right way to handle an ambiguous requirement — visibly, not silently.
- **Role-gating matches existing precedent exactly.** Reusing `Admin.tsx`'s admin-only visibility model for the sync badge, rather than inventing a new intermediate visibility tier for FRONT_DESK, keeps the authorization surface consistent with what 03-02's audit already established as this project's convention.

## 3. Enterprise Gaps Identified

1. **Retry destroys the audit trail of the failure it's fixing.** As originally written, `POST /:id/retry` set `lastError: null` alongside the status reset. The instant an admin acts on a failure, the record of what that failure actually was disappears — for a project whose own PROJECT.md lists "Silent failures (payment/webhook/sync): Zero — every failure visibly logged and alerted" as a named Success Metric, wiping the log at the exact moment a human intervenes is a direct contradiction of that commitment, not a cosmetic gap. A future support conversation ("why did Hotel X's rate stop syncing last Tuesday?") would have no answer once retried.
2. **No accountability trail on the retry action, and no guard against using it to defeat 04-04's own circuit breaker.** Nothing recorded which admin retried a row or when — a real gap given this project's explicit, repeated precedent of accountability fields on every other human-triggered state change (`Booking.createdByUserId`, `Payment.processedByUserId`, `RoomType`/`RatePlan.lastModifiedByUserId`, all justified in PROJECT.md's Key Decisions with the same reasoning: "cheaper to add now than retrofit after real [state] exists"). Separately and more seriously: `MAX_ATTEMPTS = 5` in `pushQueueWorker.ts` exists specifically to stop hammering Channex's rate-limited (10 req/min/property) and, in production, *paid* ($130/mo + $7/property) API forever on a genuinely broken mapping. As written, nothing stopped an admin (or a buggy frontend retry-button double-click, or a scripted loop) from calling retry in a tight cycle, resetting `attempts` to 0 each time and permanently bypassing that circuit breaker — the exact "external API side-effect risk" and "state ambiguity/invalid transition" category this audit is required to treat as risk even when not spelled out.
3. **The failure list returns bare foreign-key ids, not names.** `roomTypeId: "cmszkjvys0008uaq4er9k8nyp"` tells a hotel admin nothing they can act on. The plan's own stated purpose is "give hotel admins a visible way to see Channex sync health and manually retry a failed push" — without resolving to a human-readable name, the feature technically satisfies its ACs while failing its actual goal.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Retry nulls `lastError`, destroying failure evidence | Task 1b `<action>`, new AC-8 | Retry now leaves `lastError` untouched — it persists as the last-known failure reason until the next real push attempt (success or failure) overwrites it |
| 2 | No accountability trail on retry; no guard against retry-loop abuse of `MAX_ATTEMPTS` | New Task 1a (schema), Task 1b `<action>`, new AC-7 | Added `PushQueue.retriedByUserId`/`lastRetriedAt` (mirrors this project's established accountability-field convention) and a 60-second cooldown that returns 409 if a FAILED row was retried too recently — closes the loop-abuse path while still allowing a genuine manual retry |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 3 | Failure list unusable without resolved entity names | Task 1b `<action>`, Task 2 `<action>` | `GET /api/sync-status` now resolves and returns `roomTypeName`/`ratePlanName` (falling back to `"(deleted)"` if the referenced entity is gone) instead of bare cuids; the frontend task updated to display the name, not the id |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 1 | No bulk-retry action | Already explicitly out of scope in the plan's own boundaries; correct call at this single-pilot-hotel scale — add only if real usage produces enough simultaneous failures to make one-at-a-time painful |
| 2 | No length cap on `lastError`/stored Channex response bodies | Pre-existing behavior inherited from 04-04's `ChannexApiError`, not introduced by this plan — Channex's own error responses are small JSON bodies in practice; revisit only if that assumption is ever violated |
| 3 | `lastError` displayed raw to the admin without sanitization | Not a cross-tenant leak (tenant-scoped lookup) and Channex's error bodies don't echo the API key back per this project's own established `ChannexApiError` shape since 04-01/04-02 — acceptable as-is |

## 5. Audit & Compliance Readiness

- **Defensible audit evidence:** With finding 1 and 2 applied, a `PushQueue` row now carries a complete, non-destructible trail: what failed (`lastError`, preserved), how many times (`attempts`, reset only with a recorded cause), and who intervened and when (`retriedByUserId`/`lastRetriedAt`). This is the same evidentiary bar this project already holds `Booking`/`Payment` to.
- **Silent-failure prevention:** Directly served by this plan's entire purpose — the amendment specifically prevents a NEW silent-failure mode (evidence erased on retry) that the original draft would have introduced.
- **Post-incident reconstruction:** Now genuinely supported — "this rate plan failed to sync 4 times over 2 days because of a deleted Channex mapping, until Admin X retried it at 14:32 after fixing the mapping" is now reconstructable from the row alone.
- **Ownership/accountability:** Closed by finding 2's `retriedByUserId` field, consistent with this project's standing convention.

## 6. Final Release Bar

**Must be true before this plan ships:** retry must never clear `lastError`; retry must record who and when; retry must be rate-limited against its own circuit breaker. All three are now applied above.

**Risks remaining if shipped as amended:** none release-blocking. The deferred items are correctly scoped out with a stated reason and revisit trigger each, not silently ignored.

**Sign-off:** Yes, for this plan's actual scope (read-only status surface + a single, accountable, rate-limited manual retry action) at this project's current stage (single pilot hotel, pre-revenue, staging-only Channex). Not a sign-off on a future bulk-operations or automated-alerting version of this feature — that would need its own audit against its own larger risk surface (mass state changes, notification delivery guarantees).

---

**Summary:** Applied 2 must-have + 1 strongly-recommended upgrades. Deferred 3 items.
**Plan status:** Updated and ready for APPLY.

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
