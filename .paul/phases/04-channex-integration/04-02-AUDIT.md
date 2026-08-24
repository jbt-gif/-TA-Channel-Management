# Enterprise Plan Audit Report

**Plan:** .paul/phases/04-channex-integration/04-02-PLAN.md
**Audited:** 2026-08-19
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Conditionally acceptable, amended. As originally written, the plan had one internal contradiction (a task instruction that would have modified a file its own boundaries section explicitly protected), one unenforced financial-integrity gap (a margin-driving price field with no sanity constraint, in a project whose own established convention is "DB constraint is the real backstop, not documented intent"), and one unverifiable claim (an automated read-back confirmation against an endpoint this project's own research never confirmed exists). None of these are exotic risks — they're the kind of thing that looks fine on a first read and only surfaces when someone actually tries to execute the plan literally. All three are fixed below. I would sign off on the amended version for this project's current stage (pre-revenue, staging-only, single founder-operator); I would not have signed the original.

## 2. What Is Solid

- **Scope discipline.** The plan correctly refuses to build automatic-trigger wiring, rate-limiting/batching, or a background worker in this pass, deferring all three to 04-03 with a one-line reason each. This is the right vertical-slice boundary — "prove the push mechanism works" is a genuinely separable concern from "make it fire automatically under real, frequent mutation traffic," and conflating them would have produced an oversized, harder-to-verify plan.
- **Reuse over duplication.** Extending `src/lib/channex.ts` rather than creating a parallel file for outgoing calls is correct — one home for all Channex API interaction, matching this project's own stated convention.
- **The schema choice itself.** A separate `otaPrice` field (not a computed `basePrice × markup%`) was a real business decision the user made explicitly, not an assumption baked in silently. Correctly resolves the deferred item flagged since the pivot.
- **Live verification design.** Task 3's checkpoint has the founder check Channex's own dashboard directly for both the pushed rate and the pushed availability — this is a genuine external confirmation, not a self-reported "it returned 200 so it must be fine" claim. Consistent with this project's established pattern (02-05, 02-06, 03-02 all used real-browser/real-dashboard checkpoints, not automated-only claims).

## 3. Enterprise Gaps Identified

1. **No sanity constraint on a margin-driving financial field.** `otaPrice` is the number that determines the agency's actual revenue on every booking under the pivot's business model. The plan added it as a bare nullable `Decimal` with no CHECK constraint, while `basePrice` — a less business-critical field in the current model — already has `CHECK (basePrice > 0)` from Phase 1. An unconstrained zero, negative, or garbage value would ship silently and only surface downstream (a $0 OTA listing, or a push to Channex with a negative rate Channex itself may reject unpredictably). This is exactly the class of "documented intent isn't a backstop" gap this project has closed on every prior financially-relevant field.
2. **Internal contradiction between a task instruction and the boundaries section.** Task 2's original wording offered `src/routes/channexWebhook.ts` as a valid location for a new helper function, while the very same plan's `<boundaries>` section lists that exact file under `DO NOT CHANGE`. A plan that contradicts itself is not "Claude-executable without guessing" — the executor would have had to silently pick one instruction over the other, which is precisely the kind of ambiguity `plan-format.md`'s own standard exists to prevent.
3. **An unconfirmed verification method.** Task 2's verify step asked the executor to confirm a push via `GET /api/v1/availability`/`GET /api/v1/restrictions` "or equivalent read-back endpoint per RESEARCH.md" — but this phase's own `research/outgoing-ari-push.md` documents only the two POST endpoints, never a read-back GET. As written, this verify step could not actually be executed as literally specified; it would have forced an implementer to either fabricate an unconfirmed API call or silently substitute something else. Real confirmation already exists elsewhere in the plan (Task 3's dashboard checkpoint) — the gap was Task 2 duplicating a claim it couldn't back up rather than deferring to the mechanism that actually works.
4. **Rate-limit responses aren't distinguishable from generic failures.** The plan correctly defers building backoff/retry logic to 04-03, but as written, a 429 from Channex during even this plan's own single-call verification would surface identically to any other error — making it harder to diagnose "did I get rate-limited by my own earlier testing this session" versus "something is actually broken." Low severity given the plan's narrow scope, but cheap to close now.
5. **Ambiguity about whether the verification script's own DB write should survive cleanup.** This project's established throwaway-script convention (see `test-channex-webhook-synthetic.ts` from 04-01) deletes both the script file and its test data on cleanup. Task 1's plan for setting `otaPrice` via a throwaway script did not specify whether the `otaPrice` value itself should persist afterward — and it must, since Task 2's push verification and Task 3's checkpoint both need a real, already-set value to push. Left unstated, a literal reading of "throwaway script" convention could have led to the test fixture being wiped right after being created.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | No CHECK constraint on `otaPrice` | Task 1 `<action>` | Added requirement for `RatePlan_otaPrice_check CHECK ("otaPrice" IS NULL OR "otaPrice" > 0)`, migration instructions updated to hand-edit the SQL for both column and constraint; `<verify>` and `<verification>` both updated to confirm the constraint rejects 0/-1 |
| 2 | Task 2 contradicted the plan's own boundaries | Task 2 `<action>` | Removed the option to place the `ratePlanPushRate` helper in `channexWebhook.ts`; it now goes exclusively in the throwaway verification script |
| 3 | Unconfirmed read-back verification method in Task 2 | Task 2 `<verify>`, `<done>` | Removed the claim of an automated GET read-back (not documented in RESEARCH.md); Task 2's own verify now scopes to "Channex accepted the push + genuine failures throw correctly," explicitly deferring full data-change confirmation to Task 3's dashboard checkpoint |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 4 | Ambiguity about whether the verification script's `otaPrice` write should survive its own cleanup | Task 1 `<action>` | Added explicit instruction: delete the script file, do not revert the `otaPrice` value it set — it's intentional test-fixture data needed by later tasks |
| 5 | No distinction between a 429 and other push failures | Task 2 `<action>` | Added requirement for `ChannexApiError` (or the caller) to be able to distinguish a rate-limited response, supporting 04-03's future backoff logic without building it now |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 1 | No accountability trail (`lastModifiedByUserId`-style field) for who set `otaPrice` | This plan's only writer of the field is a throwaway verification script, not a real user action — accountability only becomes meaningful once a real admin UI lets a human set this value, which is explicitly a future, not-yet-named plan. Revisit when that UI is planned. |
| 2 | `otaPrice >= basePrice` not enforced (agency could technically list below cost) | This is a pricing-policy decision, not a data-integrity one — a hotel/agency may have legitimate reasons to loss-lead a specific listing. Enforcing it here would invent a business rule the plan never asked for. |
| 3 | `files_modified` uses a wildcard (`src/scripts/*`) rather than concrete paths | Minor process convention gap; harmless given this project's sequential, non-parallel PAUL execution (parallel_agents disabled) — no conflict-detection value lost in practice. |

## 5. Audit & Compliance Readiness

- **Defensible audit evidence:** Once the CHECK constraint is in place, the database itself — not just this plan's prose — prevents a nonsensical `otaPrice` from ever existing, which is the standard this project has held every other financially-relevant field to since Phase 1.
- **Silent-failure prevention:** AC-5 already required push failures to throw typed errors rather than swallow them; the added 429-distinction finding strengthens this further without expanding scope.
- **Post-incident reconstruction:** Structured logging isn't explicitly required by this plan (unlike 04-01's webhook handler, which SPECIAL-FLOWS.md names directly) — acceptable here since this plan has no automatic trigger yet and only a manual verification script calls these functions. This will need revisiting once 04-03 wires automatic, unattended calls — flag for that plan's own audit, not this one's problem to solve now.
- **Ownership/accountability:** Correctly deferred (see Deferred #1) — no real user-facing write path exists yet for the field this plan introduces.

## 6. Final Release Bar

**Must be true before this plan ships:** the CHECK constraint exists and is proven to reject invalid values; Task 2 no longer contradicts its own boundaries; Task 2's verify step only claims what it can actually confirm. All three are now applied to the plan above.

**Risks remaining if shipped as amended:** none release-blocking. The genuinely deferred items (accountability trail, margin-floor policy, wildcard file list) are correctly scoped out rather than ignored — each has a stated reason and a stated future owner (a named future plan, or an explicit non-goal).

**Sign-off:** Yes, for this plan's actual scope (schema + a manually-invoked, live-proven push client, no automatic wiring yet) and this project's current stage (staging-only, pre-revenue, single operator). This is not a sign-off on the eventual automatic-worker version (04-03) — that plan will need its own audit against its own, larger risk surface (unattended execution, rate-limit backoff correctness, and — per the note above — the same structured-logging discipline 04-01's webhook handler was held to).

---

**Summary:** Applied 3 must-have + 2 strongly-recommended upgrades. Deferred 3 items.
**Plan status:** Updated and ready for APPLY.

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
