# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-08-15)

**Core value:** Boutique PH resorts get one system that prevents overbookings, syncs rates/availability across major OTAs in real time, and collects local downpayments — without stitching together separate channel-manager, front-desk, and payment tools.

**Current focus:** Phase 2, Plan 02-01 (front-desk authentication) — planned, awaiting audit

## Current Position

Milestone: v0.1 Initial Release
Phase: 2 of 7 (Front-desk booking core) — Planning
Plan: 02-01 audited, awaiting APPLY (auth — not in original ROADMAP scope text, added because every later Phase 2 route needs hotelId-scoping context)
Status: PLAN audited, ready for APPLY — pausing for explicit approval (security-sensitive, first plan handling real credentials)
Last activity: 2026-08-15 — 02-01-PLAN.md audited and strengthened (5 must-have, 3 strongly-recommended upgrades applied)

Progress:
- Milestone: [██░░░░░░░░] 14%
- Phase 2: [░░░░░░░░░░] 0%

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ○        ○     [02-01 planned, running audit next]
```

## Accumulated Context

### Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Xendit-only payments (GCash/QR Ph/cards), no separate Maya integration | Pre-build | All payment work targets one provider |
| Central Channex account held by founder; hotels never see Channex directly | Pre-build | ChannelMapping/webhook design assumes single Channex credential set |
| Rate plans modeled as their own entity, distinct from RoomType | Pre-build | ARI has both a room-type dimension (availability) and a rate-plan dimension (price/minStay) — see the corrected DailyInventory/RatePlanDailyRate split below |
| Testing-scenario-first policy: acceptance criteria include explicit edge-case scenarios before build starts | Pre-build | Applies to every future PLAN, not optional per-phase |
| Security pass (security-review + gsd-security-auditor) required specifically on payment, webhook, and auth/multi-tenant phases | Pre-build | See .paul/SPECIAL-FLOWS.md |
| gsd-verifier goal-backward audit reserved for one pre-launch gate (before first real hotel goes live), not run per-phase | Pre-build | Avoids per-phase ceremony while product is still being shaped |
| No parallel subagent spawning by default; flag expensive operations before running them | Pre-build | See .paul/config.md Preferences + Usage Governance |
| 2026-08-15: Enterprise audit performed on 01-01-PLAN.md. Applied 5 must-have, 4 strongly-recommended upgrades. Deferred 2. Verdict: conditionally acceptable (amended) | Phase 1 | Plan strengthened: cuid ids, onDelete:Restrict, soft-delete columns, RatePlan hotelId denormalized, idempotent smoke test |
| 2026-08-15: Corrected DailyInventory design before 01-02 build — availableCount shared per [roomTypeId, date], not per rate plan. Added separate RatePlanDailyRate for price/minStay per [ratePlanId, date] | Phase 1 (caught during 01-02 planning) | Prevents same physical rooms being oversold across multiple rate plans of one room type; PROJECT.md decision log updated to match |
| 2026-08-15: Enterprise audit performed on 01-02-PLAN.md. Applied 1 must-have, 4 strongly-recommended upgrades. Deferred 1. Verdict: conditionally acceptable (amended) | Phase 1 | Added DB-level CHECK constraint enforcing bookedCount+heldCount<=availableCount — the actual overbooking backstop, not just documented intent; per-rate-plan verification instead of aggregate; zero-Rooms edge case covered |
| 2026-08-15: Enterprise audit performed on 01-03-PLAN.md. Applied 4 must-have, 2 strongly-recommended upgrades. Deferred 3. Verdict: conditionally acceptable (amended) | Phase 1 | Fixed a real financial-correctness bug (BookingItem's flat per-night price snapshot contradicted 01-02's per-date rate model — renamed to totalPriceSnapshot, full-stay total); added accountability fields (Booking.createdByUserId, Payment.processedByUserId) and Booking.totalAmount for financial reconciliation |
| 2026-08-15: Phase 1 (Data model + inventory foundation) complete — all 12 models live, migrated, and proven against real data across 3 plans | Phase 1 → Phase 2 transition | PROJECT.md evolved (Validated section populated); ROADMAP.md marked Phase 1 complete; git commit created for the phase |
| 2026-08-15: Auth strategy decided — JWT (stateless), not server-side sessions | Phase 2 (checkpoint:decision, user-confirmed) | Simpler, no Session table; accepted tradeoff: no instant token revocation before 12h expiry — documented as a deliberate risk, not a gap |
| 2026-08-15: Enterprise audit performed on 02-01-PLAN.md. Applied 5 must-have, 3 strongly-recommended upgrades. Deferred 3. Verdict: conditionally acceptable (amended) | Phase 2 | Added rate limiting, JWT_SECRET strength check, error-handling discipline, password policy on create-user.ts, and explicit documentation of the JWT-revocation tradeoff |

### Deferred Issues

| Issue | Origin | Effort | Revisit |
|-------|--------|--------|---------|
| Written service agreement (scope, liability, support definition) for hotel clients | Pre-build discussion | S | Before first paying hotel goes live |
| Cross-hotel "super admin" view for founder (monitoring sync health/bookings across all hotels) | Pre-build discussion | M | Decide before or during roadmap planning |
| Whether pilot hotels are already lined up or this is purely pre-sales | Pre-build discussion | - | Affects whether early phases build against real or assumed hotel data |
| Whether this Supabase dev project becomes the Phase 7 staging environment or stays a separate throwaway dev DB | 01-01 audit | S | Phase 7 (pre-launch gate) |
| Keeping DailyInventory.availableCount in sync when Rooms are added/removed/marked OOS after initial 365-day seeding | 01-02 audit | M | Phase 3 (room management UI) and Phase 6 (housekeeping OOS status) |

### Blockers/Concerns

None yet.

### Git State

Last commit: 022b24e — feat(01-data-model-foundation): multi-tenant schema, shared-inventory model, booking core
Branch: master
Remote: https://github.com/jbt-gif/-TA-Channel-Management (pushed 2026-08-15)
Feature branches merged: none

## Session Continuity

Last session: 2026-08-15
Stopped at: Plan 02-01 (front-desk authentication) planned and audited, paused before APPLY
Next action: Explicit user approval needed before /paul:apply on 02-01 — this is the first plan handling real credentials/JWT secrets, treated with the same manual-approval standard as Phase 4/5 rather than the low-risk Phase 1 autonomous scope.
Resume file: .paul/phases/02-front-desk-booking-core/02-01-PLAN.md

---
*STATE.md — Updated after every significant action*
