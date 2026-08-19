# Roadmap: PH Channel Manager

## Overview

Multi-tenant Channel Manager and mini-PMS — originally scoped as B2B SaaS sold to hotels, **pivoted 2026-08-18 to an internal platform for a hotel-revenue-management agency** (see PROJECT.md Key Decisions). Journey: build the foundation and core booking flow first, layer in hotel self-configuration, then the two external integrations (Channex, PayMongo) once the internal shape is solid, then housekeeping, then a pre-launch safety gate before any real hotel's data enters the system. Every phase after the foundation delivers something clickable, not just an API. Phases 1-7 below (milestone v0.1) are unaffected in their technical shape by the pivot — they're still "get the core booking engine to a demo." Two new milestones (v0.2, v0.3) are queued after v0.1 for the agency-specific pieces — see bottom of this file.

## Current Milestone

**v0.1 Initial Release** (v0.1.0)
Status: In progress
Phases: 3 of 7 complete

## Phases

**Phase Numbering:** Integer phases (1, 2, 3...) are planned milestone work. Decimal phases (e.g. 2.1) are urgent insertions, marked [INSERTED].

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Data model + inventory foundation | 3/3 | ✅ Complete | 2026-08-15 |
| 2 | Front-desk booking core | 6/6 | ✅ Complete | 2026-08-18 |
| 3 | Hotel admin config UI | 2/2 | ✅ Complete | 2026-08-18 |
| 4 | Channex integration | TBD | Not started | - |
| 5 | PayMongo payments | TBD | Not started | - |
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

### Phase 2: Front-desk booking core ✅ Complete (2026-08-18)

**Goal:** Staff can view the calendar grid and create a walk-in booking that atomically, safely decrements inventory. First phase with something real to click.
**Depends on:** Phase 1
**Research:** Unlikely

**Delivered (6/6 plans):** Full loop working end to end in a real browser, user-verified: login → see real availability/pricing grid → create a walk-in booking → grid updates live to show reduced availability, all atomically overbooking-safe and security-audited. Zero HIGH/MEDIUM security findings across all security-review passes; one real HIGH finding in 02-03 (Prisma filter-operator injection) found and fixed same-session. Three enterprise-audit passes on the frontend plans (02-04/02-05/02-06) each caught genuine bugs before code existed (missing task, email-enumeration-regression risk, timezone bug, stale-response race, past-date default bug) — none shipped unfixed.

**Scope:**
- Front-desk authentication (login + JWT + auth middleware) — added during planning; the original scope below implicitly requires knowing which hotel a request belongs to, and nothing built that yet. This is also the "multi-tenant auth/isolation phase" SPECIAL-FLOWS.md reserves a security-review pass for.
- Calendar grid query API (date-range availability/rate lookup)
- Atomic walk-in booking creation (overbooking-safe transaction)
- React calendar grid UI + walk-in booking form

**Plans:**
- 02-01: Front-desk authentication (login, JWT, auth middleware) ✅ Complete
- 02-02: Calendar grid query API (room-type list, DailyInventory/RatePlanDailyRate grid, tenant isolation) ✅ Complete
- 02-03: Atomic overbooking-safe booking transaction (POST /api/bookings, conditional-UPDATE locking, concurrency smoke test) ✅ Complete
- 02-04: Frontend scaffold + login (Vite+React+TS+Tailwind, API client, AuthContext, ProtectedRoute) ✅ Complete
- 02-05: Calendar grid UI (consumes 02-02's API) ✅ Complete
- 02-06: Walk-in booking form (consumes 02-03's API) ✅ Complete

*Note: originally estimated as one item ("React calendar grid UI + walk-in booking form"); split into 3 plans during 02-04 planning since no frontend existed yet — see STATE.md scope-split note, 2026-08-18.*

### Phase 3: Hotel admin config UI ✅ Complete (2026-08-18)

**Goal:** Hotel staff self-configure their own room types and rate plans — no founder involvement required per hotel.
**Depends on:** Phase 1
**Research:** Unlikely

**Delivered (2/2 plans):** Hotel admins can create/edit/delete room types and rate plans, and view/update the hotel's downpayment policy, entirely from a browser (/admin page) — no founder-run script needed. Checkpoint approved live in browser; security-review found zero HIGH/MEDIUM findings.

**Scope:**
- Room type + rate plan CRUD, scoped per hotel
- Basic policy settings (e.g. downpayment %)

**Plans:**
- 03-01: Backend CRUD API — RoomType CRUD, RatePlan CRUD (reuses seed-inventory.ts for immediate bookability), hotel policy settings (downpaymentPercent + DB CHECK constraint) — ✅ Complete
- 03-02: Frontend admin UI — Admin.tsx (room type/rate plan CRUD, policy settings), typed admin API client — ✅ Complete

*Note: 03-01 flags an assumption for review — new room types seed with 0 physical Rooms since Room-unit CRUD isn't in this phase's stated scope; see 03-01-PLAN.md's Assumptions Requiring Review section. Still open, not blocking.*

### Phase 4: Channex integration

**Goal:** Two-way OTA sync — incoming bookings create reservations atomically, outgoing rate/availability changes push out, staff see sync status and get alerted on failure.
**Depends on:** Phase 1
**Research:** Likely — real Channex webhook payload shapes and ARI push format needed before finalizing, not assumed from the brief alone.

**Scope:**
- `POST /api/webhooks/channex` handler (secret header verification, `booking_new`/`booking_modification`/`booking_cancellation`, atomic Prisma transaction)
- Outgoing ARI push on rate/availability change
- Sync status indicator visible in the UI (not just background logs) + staff alert on failure
- Webhook idempotency (dedupe on retry)

### Phase 5: PayMongo payments

**Goal:** Guests can pay a GCash/QR Ph/card downpayment; booking holds and releases correctly on the 15-minute timer.
**Depends on:** Phase 1, Phase 2
**Research:** Likely — real PayMongo API/webhook specifics needed before finalizing, plus per-hotel merchant-account onboarding flow (each hotel is its own PayMongo merchant, not one founder-held account).

**Scope note (added 2026-08-18, post-pivot):** Under the agency model, OTA-sourced bookings settle through the OTA itself, not PayMongo — this phase's real relevance narrows to walk-in/phone-booked guests paying a downpayment at the front desk, and later to guests booking through the direct-booking site (v0.3). Worth re-scoping (or re-sequencing after v0.3) at the time this phase is actually planned, rather than guessing now — not changed yet, flagged only.

**Scope:**
- Downpayment link generation (GCash/QR Ph/cards, hosted checkout) against each hotel's own PayMongo account
- `heldCount` hold on booking creation, 15-minute auto-release worker
- PayMongo webhook listener (signature verification, idempotent, per-hotel)
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

## Future Milestones (added 2026-08-18, post agency-model pivot)

Not yet phase-planned in detail — recorded here so the direction isn't lost, to be broken into real phases via `/paul:plan` once v0.1 is demo-ready. Order matches the founder's stated sequencing.

### v0.2: Agency Payout & Accounting Ledger

**Goal:** Make the agency's OTA payout math and hotel disbursements auditable software, not a spreadsheet — directly addresses the "agency now holds guest-derived funds" compliance question flagged in PROJECT.md.
**Depends on:** v0.1's booking/payment data model (Booking, BookingItem, Payment already exist)

**Scope (as discussed, not yet task-broken):**
- Per-booking margin calculation: OTA settlement amount minus hotel's base rate minus any OTA fees not already netted out
- Per-hotel running balance (what's currently owed, always current)
- Bank-deposit reconciliation: match actual OTA payouts received against what the booking data says should have arrived — catches underpayment or a missed settlement
- Disbursement records: proof of what was actually paid to each hotel and when, distinct from what's owed
- Schema question to resolve at planning time: RatePlan currently has one `basePrice` — the agency model needs to distinguish the hotel's base rate from the marked-up OTA listing price somewhere (new field vs. a stored markup rule). Not resolved yet — flagged for Phase 4 (Channex ARI push) or this milestone's planning, whichever comes first.

### v0.3: Direct Booking Funnel + Owned Marketplace App

**Goal:** Give each hotel a free, high-converting direct-booking presence, while funneling all actual bookings through one shared, agency-owned marketplace app (a "mini-OTA" for the network) — reduces OTA-commission dependency, builds a growth loop across the agency's hotel network, and is a genuine deliverable to hotels beyond distribution management.
**Depends on:** v0.1 (booking engine, availability model), likely v0.2 (a direct channel needs the same payout/margin logic if the agency also takes a cut here — to be decided at planning time)
**Redefined 2026-08-18:** originally scoped as an isolated direct-booking website per hotel; founder clarified the actual design during this session — see architecture below.

**Architecture (agreed, not yet task-broken):**
- **Per-hotel landing page** — cheap, marketing-only (hotel's own branding/photos/copy, SEO presence). No booking logic lives here.
- **Book button redirects into one shared app** — the agency's own booking engine, shared across every hotel in the network. Only one booking engine gets built, not one per hotel.
- **Cross-promotion built into the booking flow** — guest who lands via Hotel A's marketing sees other network hotels inside the shared app ("browse more stays"), turning each hotel's individual marketing into free distribution for the whole network.
- **Pricing: flat rate first, commission later** — first ~2 months of the app's life: no per-booking cut, flat subscription-style pricing only (cheap, removes adoption friction while the network has no traffic yet to justify a cut). Commission introduced once real guest traffic exists.
- Facebook native booking integration + direct-booking links surfaced on the hotel's social channels
- Real-time analytics: revenue, booking-channel mix, occupancy, payout margins
- Two-way sync between the hotel's front-desk dashboard and the agency's master admin dashboard (front-desk handles walk-ins/manual room status; master dashboard pushes rate/availability to Channex/OTAs) — this part is largely already the intended shape of v0.1's Phase 2-4 work, not new

**Flagged risk (must resolve before public launch, not before planning):** rate-parity. If the agency's own app sells a room at a different price than the same room's Agoda/Booking.com listing (likely, since the app has no commission cut for the first 2 months while the OTA listing carries the usual markup), that can breach OTA rate-parity clauses that require the property's price not be undercut elsewhere. Same risk category as the BSP/MSB item — needs an answer before real money/real hotels are on it, not before it's designed.

**Mitigation plan (founder-proposed 2026-08-18):** gate the discounted rate behind sign-in, matching how Marriott/Hilton-style "member rates" avoid parity violations — parity clauses generally only bind *publicly available* rates, not logged-in member rates. Design: public-facing price on the app matches the OTA-listed price; a lower "member rate" (e.g. sign in with Google to see ₱1,500 instead of ₱2,000) sits behind login. Combine with **Cloudflare Turnstile** bot-shield on the public pages so OTA rate-scraping bots can't reach the gated rate either. Still needs a lawyer/OTA-terms check that Agoda/Booking.com's specific parity clause language explicitly exempts gated/member rates the way major chains' contracts do — not assumed, just the standard industry pattern.

**Competitive-differentiation / go-to-market ideas discussed alongside this (not phase-planned, captured for later):**
- *Trust removers for hotel-owner acquisition:* no lock-in/cancel-anytime (already a stated term), guaranteed base-rate payout on a fixed schedule, a real-time dashboard the owner can check themselves (not "trust our word")
- *Onboarding value-add:* free listing photo/copy cleanup at signup — cheap to deliver, directly fixes the #1 reason small-hotel OTA listings underperform, gives a concrete before/after pitch for the next hotel
- *Revenue-partner positioning:* dynamic pricing suggestions ("raise rate this weekend, event in town") — repositions the agency from listing manager to revenue partner
- *Retention/differentiation:* repeat-guest recognition — guest who stayed at one network hotel gets recognized and offered a direct-booking perk on return, at that hotel or elsewhere in the network. Mainly benefits the hotel owner (saves them the OTA cut on repeat guests); benefits the agency indirectly via stickier clients + a genuine "we build loyalty, not just list rooms" pitch
- *Local relevance:* Viber/WhatsApp/SMS guest messaging (PH guests don't live in email); multi-language direct-booking site (Korean/Chinese toggle, PH's largest inbound tourism segments)
- *Growth lever:* referral discount — hotel owner refers another hotel, gets a fee break. Small-hotel owners in the same town/association know each other; word-of-mouth is how this segment actually buys
- *Sharpest long-term moat:* rate intelligence — showing an owner what nearby competing hotels charge, with pricing suggestions. Big chains have this; small PH hotels never do. Hard for a competitor to copy without the underlying data pipeline built up over time

### v0.4: Offline Resilience & Circuit Breaker

**Goal:** Hotel front desk keeps taking walk-in/phone bookings during a connectivity outage between the hotel's dashboard and the master (cloud) system, without risking an overbooking race against live OTA sales.
**Depends on:** v0.1 (booking engine), Phase 4 (Channex integration — freeze/unfreeze acts on the same ARI push channel)
**Origin:** Founder-designed 2026-08-18, in response to "hotel's internet goes down" scenario planning.

**Design (agreed, not yet task-broken):**
1. **Detect** — master dashboard heartbeat-checks the hotel dashboard's connection; loss of heartbeat triggers offline state.
2. **Freeze** — on detected disconnect, immediately pause the hotel's active listings on Channex/OTAs (prevents an OTA guest booking a room the front desk might also be manually selling from stale cached data).
3. **Persist locally** — while offline, the hotel dashboard keeps working normally (walk-ins, phone reservations via the front desk's phone line), storing new bookings in local browser storage instead of the (unreachable) server.
4. **Reconcile + unfreeze** — once connectivity returns: sync queued local bookings to the server, update live inventory, then unpause the Channex/OTA listings.

**Working assumption (must hold or design needs revisiting):** one hotel = one active booking point (single front desk / single phone line) at a time. This is why step 4 doesn't need a same-hotel booking-conflict resolution step — two independent local writers colliding on the same room isn't possible under this assumption. If a hotel later runs two simultaneous front-desk terminals, this assumption breaks and reconciliation needs a conflict-resolution UI added.

**Explicitly out of scope / not needed:** a total local-internet outage at the hotel (ISP down, not just a hotel-dashboard-to-master hiccup) blocks everything at that location regardless of software — no app fixes zero connectivity. That scenario's answer is a manual paper-booking fallback SOP, not engineering.

---
*Roadmap created: 2026-08-15*
*Last updated: 2026-08-18 — business model pivot to agency/reseller; v0.2, v0.3 (redefined as owned marketplace app), and v0.4 (offline resilience/circuit breaker) future milestones added; go-to-market/competitive-differentiation ideas captured under v0.3*
