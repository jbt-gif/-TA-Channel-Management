# PH Channel Manager

## What This Is

**Business model pivoted 2026-08-18 — see Key Decisions.** This is no longer software sold to hotels; it's the internal platform for a hotel-revenue-management **agency**. The agency negotiates directly with boutique Philippine resorts (10-80 rooms) under a signed representation agreement: the hotel sets a base room rate, the agency lists it on the OTAs at a marked-up price, and the spread is the agency's margin. The platform still syncs availability/rates two-way with major OTAs (Agoda, Booking.com, Expedia, Traveloka, Airbnb, Trip.com) via Channex.io middleware, prevents overbookings with atomic transactions, and gives hotel staff a front-desk calendar grid plus mobile housekeeping view — all of that is unchanged and still being built toward a demo. New, not yet built: a payout/reconciliation ledger (OTAs pay the agency net of their commission; the agency owes each hotel its base-rate share) and, later, a direct-booking funnel website + Facebook booking per hotel.

## Core Value

Boutique PH resorts get their online distribution fully managed — rates and availability synced across major OTAs, overbookings prevented — without hiring a revenue manager or juggling OTA extranets themselves. The agency earns its margin on the spread between the hotel's base rate and the OTA listing price, backed by software that makes the booking flow, the pricing, and the payout math auditable rather than manual.

## Current State

| Attribute | Value |
|-----------|-------|
| Type | Application (internal agency platform, formerly planned as SaaS) |
| Version | 0.0.0 |
| Status | In Development — Phase 1-4, 6 of 7 complete (Phase 5 resequenced out). Business model pivoted mid-build (2026-08-18); current phases (1-7) still target a working demo of the core booking engine, now serving the agency model instead of direct-to-hotel SaaS. Only Phase 7 (pre-launch gate) remains before v0.1 is demo-ready. |
| Last Updated | 2026-08-28 |

## Requirements

### Core Features

- 365-day ARI (availability/rate/inventory) grid per hotel, with configurable rate plans per room type
- Two-way OTA sync via Channex — real-time ARI push, booking pull, atomic overbooking prevention
- Front-desk manual booking + walk-in logging
- GCash/QR Ph/card downpayments via PayMongo, 15-minute hold with auto-release on expiry
- Mobile housekeeping status view
- Self-service hotel admin UI for configuring room types, rate plans, and policies

### Validated (Shipped)

- ✓ Multi-tenant data model foundation — Hotel, User, RoomType, RatePlan, Room, DailyInventory, RatePlanDailyRate, Guest, Booking, BookingItem, Payment, ChannelMapping — all live and proven against real data (Phase 1)
- ✓ Shared-availability schema (DailyInventory per room type, RatePlanDailyRate per rate plan) that prevents the same physical rooms being oversold across rate plans, with a DB-level CHECK constraint as the actual backstop (Phase 1)
- ✓ 365-day inventory seed worker, Asia/Manila timezone-correct, idempotent (Phase 1)
- ✓ Financial/audit-correct booking shape — price snapshots, accountability fields (createdByUserId/processedByUserId), status enums instead of soft-delete on financial records (Phase 1)
- ✓ Front-desk JWT authentication (login, stateless tokens, role-gated middleware) — HOTEL_ADMIN/SUPER_ADMIN/FRONT_DESK/HOUSEKEEPING roles enforced tenant-scoped (Phase 2)
- ✓ Calendar grid query API + UI — live availability/rate lookup per room type, Manila-anchored date handling, real browser-verified (Phase 2)
- ✓ Atomic, overbooking-safe walk-in booking creation — conditional-UPDATE transaction pattern, proven live under 50 concurrent requests (exactly 1 succeeds), full front-desk UI on top (Phase 2)
- ✓ Hotel self-service admin config UI — room type + rate plan CRUD (create/edit/delete, deletion blocked by active future bookings), hotel downpayment policy setting, all reachable by a HOTEL_ADMIN clicking through /admin, no founder-run script needed (Phase 3)
- ✓ Two-way Channex OTA sync, full pipeline — incoming webhook handler creates/modifies/cancels reservations atomically (security-gated PASS, 14/14 threats closed under live adversarial probing), `RatePlan.otaPrice` distinguishes the hotel's base rate from the agency's marked-up OTA listing price, outgoing rate/availability changes push automatically via a background worker (no manual script call, live-proven against Channex staging), and hotel admins see sync status with an accountable, rate-limited manual retry for failures (Phase 4)
- ✓ Mobile housekeeping status view — `/housekeeping` (tenant-scoped, role-gated `GET/PATCH /api/rooms`), rooms grouped by room type, four-status tap controls, no-op-safe accountability trail (`Room.lastChangedByUserId`/`lastChangedAt`) so a routine re-tap can't silently overwrite who actually last changed a room, real device/375px-viewport verified (Phase 6)

**Not yet shipped:** online payments (PayMongo/downpayment flow), the pre-launch safety gate, and the agency-pivot subsystems (payout ledger v0.2, direct-booking site v0.3) — Phase 7 onward (Phase 5/PayMongo resequenced out of v0.1's immediate order).

### Active (In Progress)

None — Phase 6 closed, Phase 7 (pre-launch gate) not yet planned. Phase 5 (PayMongo) remains resequenced out of v0.1's immediate order.

### Planned (Next)

- Phase 7 (Pre-launch gate) — last phase of v0.1, per ROADMAP.md's 1→2→3→4→6→7 order. Not a build phase: error/uptime monitoring, staging/production separation, backup-restore test, security review, one goal-backward audit against Core Value + Success Metrics. Phase 5 (PayMongo) resequenced out of v0.1's immediate order 2026-08-18 (see ROADMAP.md) — OTA bookings settle through the OTA now, not PayMongo; walk-in guests keep paying cash/GCash by hand for now; real online payment gets planned only after v0.3's marketplace app is finished (founder's explicit sequencing)
- **v0.2 milestone (new, added 2026-08-18): Agency payout & accounting ledger** — per-booking margin calculation (OTA settlement minus hotel base rate minus OTA fees), per-hotel running balance, bank-deposit reconciliation against expected OTA payouts, disbursement records. Not yet phase-planned.
- **v0.3 milestone (new, added 2026-08-18): Direct booking funnel + social integration** — a free direct-booking website per hotel, Facebook native booking integration, revenue/channel/occupancy analytics. Not yet phase-planned.

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

**Secondary → now effectively primary:** The founder/agency (you) — under the agency model you actively set OTA markup pricing and manage payouts across every onboarded hotel, not just monitor for support. A central admin view across all hotels is now a core requirement, not an open item.

## Context

**Business Context:**
Pre-sales stage — no hotels signed up yet. Plan is to demo against Channex's free staging environment, land pilot hotels, then move to Channex production ($130/mo + ~$7/property) once there's paying revenue to justify it.

**Business model pivot (2026-08-18):** Originally scoped as B2B SaaS sold to hotels (hotel pays a subscription/fee for the software). Now an agency/reseller model: the agency signs a representation agreement with each hotel, sets OTA listing prices above the hotel's base rate, and keeps the spread as margin. Flow, as confirmed by the founder: guest books via an OTA (e.g. Agoda) → OTA collects payment, deducts its own commission → OTA remits the net amount to the **agency's** bank account (not the hotel's) → agency owes and remits the hotel's base-rate share separately. This means the agency now holds guest-derived funds in transit, which the earlier "founder never holds guest money" architecture decision (below) was specifically designed to avoid — see the superseded row in Key Decisions. Software plumbing already built (multi-tenant schema, Channex-under-one-account design, front-desk booking core) is reusable as-is; what changes is who the software ultimately serves (agency, not hotel-as-customer) and two new required subsystems: a payout/reconciliation ledger (v0.2) and a direct-booking-site + FB integration (v0.3).

**Technical Context:**
Greenfield build, no existing codebase. Founder is a non-technical "vibe coder" — minimal coding background, relying on AI-assisted development. This elevates the importance of testing rigor, error visibility, and avoiding silent failure paths, since the founder can't independently spot subtle bugs by reading code.

## Constraints

### Technical Constraints
- Philippines timezone (Asia/Manila) only, for now
- One staff account = one hotel (no chain/multi-property logins yet)
- ~~Each hotel is its own PayMongo merchant of record — the founder never holds or moves guest payment money~~ **Superseded 2026-08-18** by the agency-model pivot (agency now holds OTA-derived guest funds by design) and by Phase 5 being resequenced out of v0.1's immediate order — see Key Decisions and ROADMAP.md Phase 5. Payment provider/architecture for walk-in downpayments and v0.3's marketplace app is an open question again, to be decided when that work is actually planned.
- You hold one central Channex.io account; hotels never see or manage Channex directly
- Channex staging (free, no card required) used for demo/build; production plan only activated once a real paying hotel goes live

### Business Constraints
- Bootstrapped, cost-conscious — avoid recurring costs (e.g. Channex production, SonarQube) until revenue justifies them
- Builder is on Claude Pro ($20/mo, 5-hour usage windows) — expensive operations (multi-agent spawns, full audits) get flagged for approval before running, and quality is never cut to save budget
- No hotels signed up yet — first hotels onboarded white-glove/manually, not through a self-serve flow

### Compliance Constraints
- Handles guest PII and real payment transactions — no formal compliance regime named yet (no explicit PCI/DPA requirement stated), but treat guest data and payment records with the same discipline as if one applied
- A written service agreement (scope, liability limits, support definition) should exist before the first paying hotel goes live with real money flowing through the system — flagged, not yet drafted
- **New, higher priority given the agency-model pivot:** the agency will hold guest-derived OTA payouts in its own bank account before remitting each hotel's share. Needs a lawyer/accountant opinion on (a) whether this requires BSP money-service-business registration or similar, and (b) how the agency recognizes revenue for tax purposes (full OTA payout vs. margin-only) before onboarding a real paying hotel under this model. Not yet obtained. The planned payout ledger (v0.2) should be built to produce a clean audit trail regardless of the answer — that's good practice either way, not a substitute for the legal opinion.
- Each hotel needs a signed representation/management agreement authorizing the agency to list and manage their OTA presence — the founder's stated plan to address the "who owns the OTA account" question. Not yet drafted; same S-effort bucket as the general service agreement above.

## Key Decisions

| Decision | Rationale | Date | Status |
|----------|-----------|------|--------|
| Xendit only (no separate Maya integration) | Xendit already aggregates GCash, QR Ph, and card payments in one integration; a second direct Maya integration would duplicate webhook/reconciliation work for no added coverage | 2026-08-15 | Superseded 2026-08-18 |
| PayMongo (not Xendit) as the payment provider; each hotel is its own merchant of record | PayMongo has deeper native PH e-wallet coverage (GCash/Maya/GrabPay/ShopeePay/QR Ph in one account), faster T+1 settlement vs Xendit's T+2-T+7, transparent published pricing, and no 2026 reliability red flags — Xendit showed a documented pattern of payout disruptions and fraud-flagging complaints in PH. Per-hotel merchant accounts (not one founder-held payment account) keep the founder as a pure software vendor — payment liability, refunds, and AML/KYC sit with whoever actually receives the guest's money, not the founder. | 2026-08-18 | Superseded 2026-08-18 (same day — the agency-model pivot happened right after this was recorded). PayMongo itself likely still gets used for direct/walk-in bookings once the direct-booking site (v0.3) exists, but the "founder never holds guest money" reasoning no longer holds for OTA-sourced bookings under the new model — see the agency-payout decision below. |
| **Business model pivot: agency/reseller, not direct SaaS** — the agency signs a representation agreement with each hotel, sets the OTA listing price above the hotel's base rate, and keeps the spread. OTAs (Agoda, Booking.com, etc.) collect guest payment, deduct their own commission, and remit the net amount to the **agency's** bank account — the agency then owes and separately remits each hotel's base-rate share. | Founder and business partner decided to pivot from selling software to hotels toward operating as the hotels' revenue-management agency, using the same platform internally. Confirmed payment flow (OTA → agency bank account → hotel) directly reverses the earlier "founder never holds guest money" decision above — flagged as a real compliance/tax question requiring a lawyer/accountant opinion before scaling past a pilot hotel, not yet obtained. | 2026-08-18 | Active |
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
| Front-desk auth is JWT (stateless), not server-side sessions | Simpler to build, no Session table needed, matches the Railway/Render backend already chosen | 2026-08-15 | Active |
| Accepted risk: JWT-stateless auth means no instant token revocation before 12-hour expiry — a stolen terminal or same-day-terminated employee retains a working token until natural expiry | Deliberate tradeoff for simplicity, made consciously during Phase 2's auth plan; documented so it's a known decision, not a silently-discovered gap | 2026-08-15 | Active (revisit if a real incident occurs or once multiple hotels are live) |
| `RatePlan.otaPrice` — a separate, independent field from `basePrice`, not a computed markup | The agency-model pivot needs to distinguish the hotel's own rate from the agency's marked-up OTA listing price; a separate field lets markup vary per rate plan without a formula constraint, at the cost of two numbers to keep in sync | 2026-08-19 | Active |
| Outgoing Channex ARI push respects the 10 req/min/property limit via a fixed 7-second worker tick (≤1 push/hotel/tick) rather than a token bucket | Simplest mechanism provably under the limit at this project's single-pilot-hotel scale; revisit only if real volume approaches the cap | 2026-08-24 | Active |
| A human-triggered write to a table the background worker otherwise owns exclusively (manual push retry) gets its own accountability fields (`retriedByUserId`/`lastRetriedAt`), and never clears the failure evidence (`lastError`) it's retrying past | Matches this project's existing accountability-field convention (Booking/Payment/RoomType/RatePlan); caught by this project's own enterprise audit before the retry endpoint was built — preserving failure evidence directly serves PROJECT.md's "zero silent failures" success metric | 2026-08-24 | Active |
| `Room.lastChangedByUserId`/`lastChangedAt` skip re-stamping when a PATCH resubmits the room's current status (no-op) | A same-value re-tap is normal usage under the housekeeping UI's always-visible status buttons, not an edge case; unconditional re-stamping would silently overwrite the true "who last changed this" record the fields exist to preserve | 2026-08-27 | Active |

**Process convention, all phases:** every enterprise-audited plan in this project has now also received a `paul-plan-critic` adversarial pass before APPLY (formalized as `required: true` in `.paul/config.md`, 2026-08-27) — the two layers have consistently caught different problem classes (audit: compliance/structural gaps; critic: assumption/usage-pattern bugs), not duplicated each other.

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
| Payments | PayMongo (GCash, QR Ph, cards) | Hosted checkout to keep PCI scope off this system; each hotel is its own PayMongo merchant of record |
| Deployment | Vercel (frontend) / Railway or Render (backend + background worker) / Supabase (Postgres) | Background worker needed for hold-expiry timer and ARI push retries |

## Links

| Resource | URL |
|----------|-----|
| Repository | https://github.com/jbt-gif/-TA-Channel-Management |
| Production | Not yet deployed |
| Documentation | This file + .paul/ROADMAP.md |

---
*PROJECT.md — Updated when requirements or context change*
*Last updated: 2026-08-28 after Phase 6 (Mobile housekeeping view) complete — 1/1 plans*
