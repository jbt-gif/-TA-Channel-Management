# Enterprise Plan Audit Report

**Plan:** .paul/phases/03-hotel-admin-config-ui/03-02-PLAN.md
**Audited:** 2026-08-18
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Not enterprise-ready as originally drafted, but the gap this time is smaller than 03-01's — no release-blocking finding, four strongly-recommended fixes, all UX/correctness rather than security or data-loss. With the amendments applied, I'd approve this for APPLY.

## 2. What Is Solid

- **Reuse of `api/bookings.ts`'s discriminated-error pattern** for the new `admin.ts` client — no new error-handling philosophy invented, consistent with everything built so far.
- **Redirect-away-from-/admin for non-admin roles even though the backend already 403s.** Correct call for this specific user base — PROJECT.md explicitly flags "limited technical sophistication," and a confusing 403 JSON blob or broken page is worse than a clean redirect for a non-technical front-desk/housekeeping user who mistyped a URL.
- **Per-form in-flight disabling instead of one page-wide lock.** Correct judgment call given this page's actual shape (many independent forms) — a single global lock modeled on 02-06's one-form case would have been the wrong pattern here, and the plan explicitly reasons about why it diverges.
- **Re-fetch-after-mutation instead of manual local-state patching.** Matches Dashboard.tsx's existing `refreshKey` philosophy — can't silently drift out of sync with the server, which local patching risks.
- **`window.confirm()` before delete.** Right-sized safety for a "plain functional, no design pass" scope — a real confirmation step without inventing a custom modal component nobody asked for.

## 3. Enterprise Gaps Identified

1. **Refetch-after-mutation can silently clobber an unrelated in-progress edit (strongly recommended).** The page has many independent forms (per-room-type edit, per-rate-plan edit, multiple "create" forms, policy form). The plan's "re-fetch the list after any successful mutation" instruction, if implemented naively (deriving each edit form's input values directly from props on every render), means finishing *any* unrelated action elsewhere on the page would silently reset whatever the admin was mid-typing in a still-open edit form. Not data loss of *saved* data, but a real, plausible UX bug for an admin doing sequential setup work — exactly the kind of thing a non-technical user would experience as "the page just ate what I typed" with no explanation.

2. **basePrice typed as `string` in the new `RatePlanSummary` field, but the plan didn't say to apply the same rule to `admin.ts`'s create/update-rate-plan response types (strongly recommended).** 03-01's own throwaway test script had to wrap every price read in `Number(...)` because Prisma's `Decimal` serializes to a JSON string. If `admin.ts`'s types declared `basePrice: number`, TypeScript would compile happily while the runtime value is actually a string — silent wrong behavior (string concatenation instead of math, or accidental correctness that breaks the next time someone touches the code), not a crash that would get caught immediately.

3. **Edit forms weren't explicitly required to pre-fill from current values (strongly recommended).** Implied by "inline edit form" but not stated. Worth being explicit given (1) and (2) above both touch the same code path — an edit form that doesn't pre-fill correctly compounds with the refetch-clobbering risk into something genuinely confusing to debug later.

4. **Checkpoint step verifying 03-01's most significant audit finding (delete-blocked-by-booking) was marked "optional" (strongly recommended).** This live-UI check is the one piece of end-to-end confirmation that the single biggest fix from 03-01 (blocking deletion of actively-booked inventory) actually surfaces correctly through this new UI, not just at the API layer. Marking it optional undersold its importance relative to every other step in the same checklist.

No must-have findings — unlike 03-01, nothing here risks silent data loss of already-saved records, security bypass, or a broken core guarantee. Everything found is a real but recoverable UX correctness issue.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

None.

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Edit forms not explicitly required to pre-fill | Task 2 action | Added explicit pre-fill requirement for both room type and rate plan edit forms |
| 2 | basePrice type risk in admin.ts response types | Task 1 action | Added explicit instruction: every money-shaped field (basePrice) types as `string` in all `admin.ts` responses, not `number`; `downpaymentPercent` stays `number` (real Int column) |
| 3 | Refetch can clobber unrelated in-progress edits | AC-9 (new), Task 2 action, checkpoint step 10 (new) | Added AC-9 requiring this not happen; added explicit implementation guidance (initialize local edit-form state once per edit-mode-entry, not recomputed from props every render); added a live checkpoint step to confirm it |
| 4 | Delete-blocked-by-booking checkpoint step marked optional | Checkpoint how-to-verify step 9 | Changed from "(Optional but recommended)" to required, with rationale noted inline |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|------------------------|
| 5 | No explicit `min`/`step` HTML attributes called out for every number input beyond basePrice | Minor, standard HTML5 validation already implied by existing codebase convention (BookingForm.tsx's `min="1"` on quantity); not worth a formal finding on top of the four above |

## 5. Audit & Compliance Readiness

This plan is a pure UI consumer of an already-audited, already-security-reviewed API (03-01) — it introduces no new attack surface, no new data model, no new authorization logic (the redirect is UX, the real gate is 03-01's existing 403). The four findings here are all about correctness/usability for the actual non-technical user base PROJECT.md describes, not about defensibility under audit. Nothing here would fail a compliance review; nothing here touches financial or PII records.

## 6. Final Release Bar

**Must be true before this plan ships:** the delete-blocked-by-booking flow (checkpoint step 9) and the concurrent-edit-doesn't-clobber behavior (checkpoint step 10, AC-9) should both be live-verified, not just code-reviewed — both are the kind of thing that looks fine in a code read and only reveals itself under actual multi-form interaction.

**Risks if shipped as amended:** none release-blocking. The one deferred item (missing explicit min/step attributes beyond basePrice) is cosmetic input-validation redundancy, not a correctness gap — the backend remains the authoritative validator regardless.

**Sign-off:** Yes, with the applied fixes and provided checkpoint steps 9 and 10 are both live-verified before UNIFY closes.

---

**Summary:** Applied 0 must-have + 4 strongly-recommended upgrades. Deferred 1 item.
**Plan status:** Updated and ready for APPLY.

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
