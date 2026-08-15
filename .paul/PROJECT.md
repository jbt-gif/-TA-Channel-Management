# PH Channel Manager

## What This Is

A multi-tenant B2B Channel Manager and mini-PMS for boutique Philippine resorts (10-80 rooms). Syncs availability, rates, and inventory two-way with major OTAs (Agoda, Booking.com, Expedia, Traveloka, Airbnb, Trip.com) via Channex.io middleware, prevents overbookings with atomic transactions, handles local GCash/QR Ph/card downpayments via Xendit, and gives hotel staff a front-desk calendar grid plus mobile housekeeping view. Built to be sold as a SaaS product to multiple independent hotel clients, not a custom one-off build.

## Core Value

Boutique PH resorts get one system that prevents overbookings, syncs rates/availability across major OTAs in real time, and collects local downpayments — without stitching together separate channel-manager, front-desk, and payment tools.

## Current State

| Attribute | Value |
|-----------|-------|
| Type | Application (SaaS) |
| Version | 0.0.0 |
| Status | In Development — Phase 1 of 7 complete |
| Last Updated | 2026-08-15 |

## Requirements

### Core Features

- 365-day ARI (availability/rate/inventory) grid per hotel, with configurable rate plans per room type
- Two-way OTA sync via Channex — real-time ARI push, booking pull, atomic overbooking prevention
- Front-desk manual booking + walk-in logging
- GCash/QR Ph/card downpayments via Xendit, 15-minute hold with auto-release on expiry
- Mobile housekeeping status view
- Self-service hotel admin UI for configuring room types, rate plans, and policies

### Validated (Shipped)

- ✓ Multi-tenant data model foundation — Hotel, User, RoomType, RatePlan, Room, DailyInventory, RatePlanDailyRate, Guest, Booking, BookingItem, Payment, ChannelMapping — all live and proven against real data (Phase 1)
- ✓ Shared-availability schema (DailyInventory per room type, RatePlanDailyRate per rate plan) that prevents the same physical rooms being oversold across rate plans, with a DB-level CHECK constraint as the actual backstop (Phase 1)
- ✓ 365-day inventory seed worker, Asia/Manila timezone-correct, idempotent (Phase 1)
- ✓ Financial/audit-correct booking shape — price snapshots, accountability fields (createdByUserId/processedByUserId), status enums instead of soft-delete on financial records (Phase 1)

**Not yet shipped:** none of the above is reachable via API or UI yet — Phase 1 is schema-only, by design. No user-facing ARI grid, booking flow, or OTA/payment integration exists until Phases 2–5.

### Active (In Progress)

None — Phase 1 fully closed, Phase 2 not yet planned.

### Planned (Next)

- Phase 2: Front-desk booking core — calendar grid query API, atomic overbooking-safe walk-in booking creation, React calendar grid UI

### Out of Scope (for now)

- Multi-property staff logins (one staff account = one hotel, chains not yet supported)
- Self-service hotel signup flow (first hotels onboarded white-glove, manually)
- Timezones outside Asia/Manila
- Automatic out-of-service-room deduction from availability (manual staff step for now)
- Hotels holding their own Channex account/credentials (you hold one central Channex account; hotels are properties under it)

## Target Users

**Primary:** Boutique/independent resort owners and their front-desk/housekeeping staff in the Philippines (10-80 room properties)
- Limited technical sophistication — needs a simple, self-explanatory admin UI
- Currently juggling multiple OTA extranets manually or paying for a generic international channel manager not suited to PH payment methods

**Secondary:** The founder (you) — needs a central admin view across all onboarded hotels for support/monitoring (open item, not yet decided — see Key Decisions)

## Context

**Business Context:**
Pre-sales stage — no hotels signed up yet. Plan is to demo against Channex's free staging environment, land pilot hotels, then move to Channex production ($130/mo + ~$7/property) once there's paying revenue to justify it.

**Technical Context:**
Greenfield build, no existing codebase. Founder is a non-technical "vibe coder" — minimal coding background, relying on AI-assisted development. This elevates the importance of testing rigor, error visibility, and avoiding silent failure paths, since the founder can't independently spot subtle bugs by reading code.

## Constraints

### Technical Constraints
- Philippines timezone (Asia/Manila) only, for now
- One staff account = one hotel (no chain/multi-property logins yet)
- Single payment provider (Xendit) covering GCash, QR Ph, and cards — not a separate Maya integration
- You hold one central Channex.io account; hotels never see or manage Channex directly
- Channex staging (free, no card required) used for demo/build; production plan only activated once a real paying hotel goes live

### Business Constraints
- Bootstrapped, cost-conscious — avoid recurring costs (e.g. Channex production, SonarQube) until revenue justifies them
- Builder is on Claude Pro ($20/mo, 5-hour usage windows) — expensive operations (multi-agent spawns, full audits) get flagged for approval before running, and quality is never cut to save budget
- No hotels signed up yet — first hotels onboarded white-glove/manually, not through a self-serve flow

### Compliance Constraints
- Handles guest PII and real payment transactions — no formal compliance regime named yet (no explicit PCI/DPA requirement stated), but treat guest data and payment records with the same discipline as if one applied
- A written service agreement (scope, liability limits, support definition) should exist before the first paying hotel goes live with real money flowing through the system — flagged, not yet drafted

## Key Decisions

| Decision | Rationale | Date | Status |
|----------|-----------|------|--------|
| Xendit only (no separate Maya integration) | Xendit already aggregates GCash, QR Ph, and card payments in one integration; a second direct Maya integration would duplicate webhook/reconciliation work for no added coverage | 2026-08-15 | Active |
| Single central Channex account (you hold it, hotels are properties under it) | Standard SaaS channel-manager pattern; hotels never touch Channex directly, keeps OTA billing/contracts bundled into the product | 2026-08-15 | Active |
| Rate plans modeled as their own entity, not folded into RoomType | OTAs (Agoda/Booking/Expedia) push/pull ARI per rate plan (refundable, non-refundable, breakfast-included, etc.), not just per room type — original brief's data model didn't have this dimension | 2026-08-15 | Active |
| DailyInventory (availability count) keyed [roomTypeId, date] — shared across all rate plans of that room type. RatePlanDailyRate (price, minStay) keyed [ratePlanId, date] separately. | Corrects an earlier version of this decision that would have given each rate plan its own independent availableCount — that would let the same physical rooms be sold twice over via different rate plans, directly contradicting the zero-overbookings goal. Matches Channex's real ARI model (availability is room-type-scoped, rates are rate-plan-scoped). | 2026-08-15 | Active |
| Downpayment amount configurable per hotel (not system-wide) | Matches the "configurable, sellable product" direction — different hotels will want different deposit policies | 2026-08-15 | Active |
| All payment methods (GCash/QR Ph/cards) follow the same hold-and-release flow | Simpler to build and reason about than separate logic paths per payment method | 2026-08-15 | Active |
| Hotels self-configure room types/rate plans via admin UI (not built per-hotel by the founder) | Required for this to scale as a sellable SaaS product rather than a one-off custom build per client | 2026-08-15 | Active |
| Enterprise plan audit + dedicated security auditor pass enabled for this project | Real money, guest PII, and non-technical founder relying on AI-assisted build raise the bar above default PAUL settings | 2026-08-15 | Active |
| Financial/audit records (Booking, Payment) never soft- or hard-deleted — cancellation/failure are statuses, not deletions | Bookings and payments must remain queryable for reconciliation and dispute resolution; deleting or hiding them would break audit reconstruction | 2026-08-15 | Active |
| Booking/Payment carry nullable accountability fields (createdByUserId, processedByUserId) from schema time | A system handling real money needs a "who did this" trail for dispute resolution; cheaper to add now than retrofit after real bookings exist | 2026-08-15 | Active |
| Price/total snapshots on booking records must capture the computed TOTAL, never a flat per-unit rate, whenever the underlying rate source varies (RatePlanDailyRate is per-date) | A flat per-night figure would silently misstate a booking's real cost the first time a rate plan had date-varying pricing — caught during Phase 1's audit before any booking logic was built on top of it | 2026-08-15 | Active |

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Overbooking incidents | Zero | - | Not started |
| Silent failures (payment/webhook/sync) | Zero — every failure visibly logged and alerted | - | Not started |
| Error + uptime monitoring live before first real hotel | Wired in before go-live | - | Not started |
| Backup restore tested | At least once, verified | - | Not started |
| Staging environment separate from production | In place before any real hotel's data enters the system | - | Not started |
| Security review completed | Before first paying client | - | Not started |
| Core booking flows verified end-to-end | Walk-in booking, OTA webhook booking, rate/availability push+pull, GCash/QRPh/card downpayment + hold + release, booking modification/cancellation, housekeeping status updates | - | Not started |
| Scenario test bank coverage | Documented test scenarios for overbooking concurrency, webhook idempotency, payment/hold timing, timezone boundaries, multi-tenant isolation | - | Not started |

## Tech Stack / Tools

| Layer | Technology | Notes |
|-------|------------|-------|
| Backend | Node.js + Express (TypeScript, ES Modules) | |
| Database/ORM | PostgreSQL + Prisma | |
| Frontend | React (Vite) + Tailwind CSS + TypeScript | |
| OTA Middleware | Channex.io (REST API + Webhooks) | Staging (free) for build/demo, production once paying |
| Payments | Xendit (GCash, QR Ph, cards) | Hosted checkout to keep PCI scope off this system |
| Deployment | Vercel (frontend) / Railway or Render (backend + background worker) / Supabase (Postgres) | Background worker needed for hold-expiry timer and ARI push retries |

## Links

| Resource | URL |
|----------|-----|
| Repository | Not yet created |
| Production | Not yet deployed |
| Documentation | This file + .paul/ROADMAP.md |

---
*PROJECT.md — Updated when requirements or context change*
*Last updated: 2026-08-15 after Phase 1*
