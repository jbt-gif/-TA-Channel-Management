# Roadmap: PH Channel Manager

## Overview

Multi-tenant B2B Channel Manager and mini-PMS for boutique Philippine resorts. Journey: build the foundation and core booking flow first, layer in hotel self-configuration, then the two external integrations (Channex, Xendit) once the internal shape is solid, then housekeeping, then a pre-launch safety gate before any real hotel's data enters the system. Every phase after the foundation delivers something clickable, not just an API.

## Current Milestone

**v0.1 Initial Release** (v0.1.0)
Status: In progress
Phases: 1 of 7 complete

## Phases

**Phase Numbering:** Integer phases (1, 2, 3...) are planned milestone work. Decimal phases (e.g. 2.1) are urgent insertions, marked [INSERTED].

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Data model + inventory foundation | 3/3 | ✅ Complete | 2026-08-15 |
| 2 | Front-desk booking core | TBD | Not started | - |
| 3 | Hotel admin config UI | TBD | Not started | - |
| 4 | Channex integration | TBD | Not started | - |
| 5 | Xendit payments | TBD | Not started | - |
| 6 | Mobile housekeeping view | TBD | Not started | - |
| 7 | Pre-launch gate | TBD | Not started | - |

## Phase Details

### Phase 1: Data model + inventory foundation ✅ Complete (2026-08-15)

**Goal:** Prisma schema for all core models, multi-tenant scoping pattern, and a 365-day DailyInventory seed worker — the foundation every later phase builds on.
**Depends on:** Nothing (first phase)
**Research:** Unlikely (internal patterns) — the overbooking-safe transaction/locking strategy shape was deliberately designed within this phase (BookingItem's fields), though the transaction logic itself is Phase 2's job.

**Delivered (3/3 plans):**
- Prisma schema: `Hotel`, `User` (roles: SUPER_ADMIN, HOTEL_ADMIN, FRONT_DESK, HOUSEKEEPING), `RoomType`, `RatePlan`, `Room` (with `HousekeepingStatus`) — 01-01
- `DailyInventory` (shared per `[roomTypeId, date]`) + `RatePlanDailyRate` (per `[ratePlanId, date]`) — corrected from the original single-table design to prevent overselling across rate plans — plus a 365-day Asia/Manila-aware idempotent seed worker — 01-02
- `Guest`, `Booking`, `BookingItem`, `Payment`, `ChannelMapping` — with financial-audit-correct fields (price/total snapshots, accountability fields, no soft-delete on financial records) — 01-03
- Multi-tenant scoping (`hotelId` + cuid ids + `onDelete: Restrict` + `@@index([hotelId])`) applied consistently across all 12 models
- DB-level CHECK constraints as the real overbooking/data-integrity backstop, not just documented intent
- Nothing visible yet — this phase was deliberately backend-only, the plumbing every later phase builds on

**Plans:**
- 01-01: Backend scaffold + core schema
- 01-02: DailyInventory + RatePlanDailyRate + seed worker
- 01-03: Guest, Booking, BookingItem, Payment, ChannelMapping

### Phase 2: Front-desk booking core

**Goal:** Staff can view the calendar grid and create a walk-in booking that atomically, safely decrements inventory. First phase with something real to click.
**Depends on:** Phase 1
**Research:** Unlikely

**Scope:**
- Calendar grid query API (date-range availability/rate lookup)
- Atomic walk-in booking creation (overbooking-safe transaction)
- React calendar grid UI + walk-in booking form

### Phase 3: Hotel admin config UI

**Goal:** Hotel staff self-configure their own room types and rate plans — no founder involvement required per hotel.
**Depends on:** Phase 1
**Research:** Unlikely

**Scope:**
- Room type + rate plan CRUD, scoped per hotel
- Basic policy settings (e.g. downpayment %)

### Phase 4: Channex integration

**Goal:** Two-way OTA sync — incoming bookings create reservations atomically, outgoing rate/availability changes push out, staff see sync status and get alerted on failure.
**Depends on:** Phase 1
**Research:** Likely — real Channex webhook payload shapes and ARI push format needed before finalizing, not assumed from the brief alone.

**Scope:**
- `POST /api/webhooks/channex` handler (secret header verification, `booking_new`/`booking_modification`/`booking_cancellation`, atomic Prisma transaction)
- Outgoing ARI push on rate/availability change
- Sync status indicator visible in the UI (not just background logs) + staff alert on failure
- Webhook idempotency (dedupe on retry)

### Phase 5: Xendit payments

**Goal:** Guests can pay a GCash/QR Ph/card downpayment; booking holds and releases correctly on the 15-minute timer.
**Depends on:** Phase 1, Phase 2
**Research:** Likely — real Xendit API/webhook specifics needed before finalizing.

**Scope:**
- Downpayment link generation (GCash/QR Ph/cards, hosted checkout)
- `heldCount` hold on booking creation, 15-minute auto-release worker
- Xendit webhook listener (signature verification, idempotent)
- Payment UI: trigger checkout, see booking move pending → confirmed

### Phase 6: Mobile housekeeping view

**Goal:** Housekeeping staff update room status from a phone-sized screen.
**Depends on:** Phase 1

**Scope:**
- Mobile-first room status view (CLEAN/DIRTY/INSPECTING/OUT_OF_SERVICE)

### Phase 7: Pre-launch gate

**Goal:** Not a build phase — the safety checkpoint before any real hotel's data enters the system.
**Depends on:** Phase 2, Phase 4, Phase 5

**Scope:**
- Error + uptime monitoring wired in
- Staging environment separate from production
- Backup restore tested at least once
- Real security review pass
- Single goal-backward audit (`gsd-verifier`) against PROJECT.md Core Value + Success Metrics

---
*Roadmap created: 2026-08-15*
*Last updated: 2026-08-15 — Phase 1 complete*
