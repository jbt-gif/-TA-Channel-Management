# PAUL Session Handoff

**Session:** 2026-08-15
**Phase:** 1 of 7 — Data model + inventory foundation
**Context:** Project setup (PAUL init, requirements, security/testing/budget policy) followed by Plans 01-01 and 01-02 of Phase 1

---

## Session Accomplishments

**Pre-build (requirements & setup):**
- Read the original OTA System Project brief and identified gaps: missing rate-plan dimension in ARI, undefined overbooking-lock strategy, missing webhook idempotency, Xendit-vs-Maya redundancy, no scheduled worker for hold-expiry, no timezone handling, no OOO-inventory linkage
- Clarified the project is a pre-sales, sellable SaaS product (not a one-hotel build) — this drove the "hotels self-configure everything" direction throughout
- Locked in: Xendit-only payments (GCash/QR Ph/cards), one central Channex account you control, configurable downpayment per hotel, PH timezone only, one staff account = one hotel, white-glove onboarding for first hotels
- Researched Channex pricing/sandbox (free staging, no card required) and confirmed the demo-first plan is viable at zero cost until a real paying hotel goes live
- Identified and clarified `loop-engineering` (already installed globally, 6 skills for maintenance-phase babysitting) vs. PAUL (build-phase framework, also already installed) vs. Seed (ideation phase, not used — we'd already done its job through conversation)
- Loaded `app-build-sop.md` (this project qualifies: client-facing app, non-technical founder) and pushed back on "zero bugs forever" as an unrealistic success criterion, reframing to zero overbookings / zero silent failures / tested backups / staging / security review / defined recovery expectations
- Ran `/paul:init`: created PROJECT.md, ROADMAP.md, STATE.md, config.md, SPECIAL-FLOWS.md, paul.json
- Configured: enterprise plan audit ON, goal-backward audit (`gsd-verifier`) reserved for a single pre-launch gate (not per-phase), security-review + `gsd-security-auditor` required specifically on payment/webhook/auth phases, usage-governance policy documented (no parallel agents by default, flag expensive ops, checkpoint at usage-window boundaries)
- Defined and confirmed the 7-phase roadmap (foundation → booking core → admin UI → Channex → Xendit → housekeeping → pre-launch gate), restructured once to bring UI forward into earlier phases per PAUL's own vertical-slice guidance
- Also updated the global `app-build-sop.md` with a new "PAUL setup pattern" section so this whole setup approach is reusable on future client builds, not just this one

**Plan 01-01 (backend scaffold + core schema) — complete:**
- Scaffolded Node/Express/TypeScript/ESM backend, Prisma, health-check endpoint
- Set up Supabase dev database (free tier) — discovered this machine has no outbound IPv6, so used Transaction pooler (`DATABASE_URL`, port 6543, `?pgbouncer=true`) + Session pooler (`DIRECT_URL`, port 5432) instead of Direct connection, avoiding the paid IPv4 add-on
- Audited and strengthened the plan before building: cuid ids (not sequential), `onDelete: Restrict` on every tenant FK, soft-delete via `deletedAt`, RatePlan's hotelId denormalized (not just reachable via RoomType join), idempotent smoke test
- Built and verified against the real database: Hotel, User (+Role), RoomType, RatePlan, Room — migrated, smoke-tested twice, invalid enum insert confirmed rejected

**Plan 01-02 (DailyInventory + seed worker) — applied, UNIFY pending:**
- Caught and fixed a real design flaw before building: the original "DailyInventory keyed by [roomTypeId, ratePlanId, date]" would have let each rate plan track independent availability, allowing the same physical rooms to be oversold across multiple rate plans. Corrected to: `DailyInventory` shared per `[roomTypeId, date]`, separate `RatePlanDailyRate` per `[ratePlanId, date]` for price/minStay only
- Audit added a database-level CHECK constraint (`bookedCount + heldCount <= availableCount`) as the actual overbooking backstop, not just documented intent — verified live with a real rejected write
- Built and verified: schema migrated (two migrations — models, then constraints), 365-day seed worker written with Asia/Manila-correct date handling, smoke-tested across 2 separate process runs covering the shared-count case, per-rate-plan pricing, the zero-Rooms edge case, and idempotency (12/12 checks passed both runs)

---

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Xendit-only payments, one central Channex account | Avoids duplicate integration work; standard SaaS channel-manager pattern | All Phase 4/5 work targets a single provider each |
| Rate plans are their own entity; DailyInventory is shared per room type, RatePlanDailyRate is per rate plan | Prevents overselling the same physical rooms across multiple rate plans | Core to zero-overbookings goal; enforced at DB level via CHECK constraint |
| cuid ids, onDelete:Restrict, soft-delete (deletedAt) as standing patterns from 01-01 onward | Cheap now, expensive to retrofit after real data exists | Every future model must follow this pattern |
| Enterprise plan audit always runs automatically after `/paul:plan`; APPLY always requires explicit approval | Audits only strengthen documents (safe to automate); APPLY touches real infrastructure (must stay a human decision) | Established as a standing rule for the rest of the project |
| Security review (`security-review` + `gsd-security-auditor`) reserved for payment/webhook/auth phases only; goal-backward audit (`gsd-verifier`) reserved for one pre-launch gate | Matches actual risk concentration without adding ceremony to every phase | Documented in SPECIAL-FLOWS.md and config.md |

---

## Gap Analysis with Decisions

### Written service agreement for hotel clients
**Status:** DEFER
**Notes:** Should exist before the first paying hotel goes live with real money flowing through the system. Not blocking any current build work.
**Effort:** S

### Cross-hotel "super admin" view for founder
**Status:** DEFER — not yet decided whether it's in MVP scope
**Notes:** Needed for monitoring sync health/bookings across all onboarded hotels. Revisit before or during later roadmap planning.
**Effort:** M

### Whether pilot hotels are already lined up
**Status:** OPEN — unresolved
**Notes:** Affects whether later phases should build against real hotel data assumptions or stay fully generic. Not answered yet.

### Supabase dev project vs. Phase 7 staging environment
**Status:** DEFER
**Notes:** Whether this same Supabase project becomes the eventual staging environment, or a separate one gets created, is a Phase 7 (pre-launch gate) decision.
**Effort:** S
**Reference:** `@.paul/phases/01-data-model-foundation/01-01-AUDIT.md`

### Keeping DailyInventory.availableCount in sync with Room changes
**Status:** DEFER — named owner assigned
**Notes:** Seeding sets availableCount once; nothing yet keeps it correct if Rooms are added/removed/marked OOS afterward. Owned by Phase 3 (room management UI) and Phase 6 (housekeeping OOS status).
**Effort:** M
**Reference:** `@.paul/phases/01-data-model-foundation/01-02-AUDIT.md`

---

## Open Questions

- Product name still undecided (currently using "PH Channel Manager" as a placeholder — trivial to rename later, no code depends on it)
- Whether pilot hotels are already lined up or this remains purely pre-sales

---

## Reference Files for Next Session

```
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md
@.paul/config.md
@.paul/SPECIAL-FLOWS.md
@.paul/phases/01-data-model-foundation/01-01-SUMMARY.md
@.paul/phases/01-data-model-foundation/01-02-PLAN.md
@.paul/phases/01-data-model-foundation/01-02-AUDIT.md
@prisma/schema.prisma
```

---

## Prioritized Next Actions

| Priority | Action | Effort |
|----------|--------|--------|
| 1 | Run `/paul:unify` on Plan 01-02 to close the loop and write its SUMMARY.md | XS |
| 2 | Plan and build 01-03 (Guest, Booking, BookingItem, Payment, ChannelMapping models + multi-tenant scoping enforcement) — the last plan in Phase 1 | M |
| 3 | Phase transition into Phase 2 (front-desk booking core) once Phase 1's 3 plans are all complete | — |

---

## State Summary

**Current:** Phase 1 of 7, Plan 01-02 applied, loop at APPLY complete, awaiting UNIFY
**Next:** Run `/paul:unify` on 01-02, then plan 01-03
**Resume:** `/paul:resume` then read this handoff

---
*Handoff created: 2026-08-15*
