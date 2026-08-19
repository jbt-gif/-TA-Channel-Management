# Enterprise Plan Audit Report

**Plan:** `.paul/phases/02-front-desk-booking-core/02-05-PLAN.md`
**Audited:** 2026-08-18
**Verdict:** Conditionally acceptable (amended)

---

## 1. Executive Verdict

Not acceptable as originally drafted — three release-blocking gaps, each with a concrete, demonstrable failure scenario. Conditionally acceptable as amended. Lower blast-radius than the backend plans (no money/PII mutation, read-only view), but this is the screen a front-desk employee makes real availability decisions from — a wrong date or a stale/incorrect number displayed here is exactly the kind of silent failure PROJECT.md's own Technical Context calls out as elevated-risk given the non-technical founder can't independently catch subtle frontend bugs by reading code.

## 2. What Is Solid

- **Refusal to re-derive availability/pricing client-side.** The plan explicitly instructs rendering only the API's own numbers, never recomputing them in the frontend — correctly treats the backend as the single source of truth for anything overbooking-adjacent, consistent with 02-02/02-03's own design.
- **The seeded/sold-out/available three-state distinction was already planned**, not left as a two-state (available/unavailable) simplification that would have silently conflated "not yet seeded" with "sold out" — two very different operational meanings for staff.
- **Correctly refuses to add backend-restriction scope** (e.g. role-gating calendar viewing) that the backend itself (02-02) never implemented — not inventing a requirement the API doesn't support.

## 3. Enterprise Gaps Identified

1. **Browser-local-timezone dependency in "today" computation.** The original plan left the Manila-today calculation as "reuse pattern... or a simple UTC-midnight helper" — ambiguous enough that a literal implementation using `new Date().toISOString().slice(0,10)` would compute "today" from the browser's local timezone, not Asia/Manila. The entire backend (seed worker, calendar API) is Manila-anchored by explicit design; a frontend that silently uses a different anchor could show staff the wrong starting date under a mismatched system clock/timezone — undermining the exact accuracy this screen exists to provide.
2. **No stale-response guard on rapid interaction.** Nothing in the original plan prevented an out-of-order response from an earlier `fetchCalendar` call overwriting the grid after a newer request had already been fired (rapid double-click on Next, or quick room-type switching). This is a classic, well-known frontend race condition — the plan's own "no stale data lingers" AC-4 language implicitly assumes single-request-at-a-time behavior it never actually enforced.
3. **Missing rate-cell handling for a seeded date with an unpriced rate plan.** `rates[ratePlanId]` can be `undefined` for a given date even when the date itself is seeded (e.g. a rate plan added after that date's `RatePlanDailyRate` rows were already created). Nothing in the original plan specified this case — a literal implementation reading `rates[ratePlanId].price` would throw, and a defensive-but-unspecified implementation might render a blank cell indistinguishable from a genuinely free-of-charge line item.

## 4. Upgrades Applied to Plan

### Must-Have (Release-Blocking)

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Timezone-dependent "today" computation | Task 2 `<action>` | Explicit instruction to mirror `seed-inventory.ts`'s `getManilaToday()` UTC+8/UTC-midnight pattern client-side; explicit prohibition on browser-local-timezone-dependent date computation |
| 2 | No stale-response guard | Task 2 `<action>`, `<verify>` | Explicit AbortController/request-id staleness-guard requirement; added a rapid-double-click test to the task's own verify step |
| 3 | Missing rate-cell handling for unpriced date/rate-plan pairs | Task 2 `<action>` | Explicit "no rate set" rendering rule added to the per-cell logic list, alongside the existing seeded/sold-out rules |

### Strongly Recommended

| # | Finding | Plan Section Modified | Change Applied |
|---|---------|----------------------|-----------------|
| 1 | Room-type-loading state not distinguished from confirmed-empty | Task 2 `<action>` | Added explicit loading-vs-empty distinction for the room-type selector, same isLoading-gate pattern already established in 02-04's AuthContext |
| 2 | Unspecified price-string parsing/formatting | Task 2 `<action>` | Added explicit `Number(price)` + `Intl.NumberFormat` instruction, replacing the vague "format as PHP currency" phrasing |

### Deferred (Can Safely Defer)

| # | Finding | Rationale for Deferral |
|---|---------|-------------------------|
| 1 | Currency-formatter code organization (shared util vs. inline) | Code-quality/DRY concern, not a correctness or security issue at this plan's scope (one component uses it) |
| 2 | Room-type deleted mid-session by a concurrent actor | Speculative for this MVP's realistic single-actor-per-session usage pattern; not implied by anything in this plan's stated scope |

## 5. Audit & Compliance Readiness

- **Silent failures:** All three must-have findings were silent-failure risks specifically (wrong date shown with no error, stale data shown with no error, a crash or misleading blank cell) — all closed by this amendment. This is consistent with — and reinforces — PROJECT.md's own elevated bar on silent-failure prevention.
- **Post-incident reconstruction:** N/A for this plan — no data mutation occurs; a display bug here has no persistent-record consequence, only an in-the-moment decision-quality risk for staff.
- **What would fail a real audit if shipped unamended:** Finding 1 (timezone dependency) is the one most likely to actually manifest in production — cloud/VM-hosted staff devices, or any machine not perfectly clocked to Asia/Manila, would silently misalign with the backend's own date semantics.

## 6. Final Release Bar

**What must be true before this plan ships (APPLY):**
- The Manila-today helper is implemented and actually matches `seed-inventory.ts`'s convention — not just present in the plan text.
- The staleness guard is implemented and the rapid-double-click scenario is genuinely tested during the checkpoint, not assumed.
- Checkpoint approved by the user against real seeded data, as with 02-04.

**What risks remain if shipped exactly as amended:**
- None identified beyond the two deferred items, both low-likelihood/low-impact at this project's current scale.

**Sign-off:** I would sign this plan as amended for its stated scope (read-only availability view, single active session per staff member). No compliance-relevant risk remains once the three must-have fixes land in actual code, not just plan text.

---

**Summary:** Applied 3 must-have + 2 strongly-recommended upgrades. Deferred 2 items.
**Plan status:** Updated and ready for APPLY.

---
*Audit performed by PAUL Enterprise Audit Workflow*
*Audit template version: 1.0*
