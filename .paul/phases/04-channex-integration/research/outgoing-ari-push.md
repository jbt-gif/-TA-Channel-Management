# Research: Channex Outgoing ARI Push + Environments

**Researched:** 2026-08-18
**Method:** WebSearch/WebFetch against docs.channex.io and channex.io/pricing.

## Outgoing ARI push endpoints

Two separate POST endpoints, not one combined push — Channex explicitly recommends sending them as separate calls, not combined:

- `POST /api/v1/restrictions` — rates + restrictions, scoped per **rate plan** + date(s). Body: `{"values": [{property_id, rate_plan_id, date (or date_from/date_to), rate, min_stay_arrival, min_stay_through, closed_to_arrival, closed_to_departure, stop_sell, max_stay, days}]}`. At least one restriction field required per item; updates process in FIFO order (later overrides earlier).
- `POST /api/v1/availability` — scoped per **room type** + date(s). Body: `{"values": [{property_id, room_type_id, date (or date_from/date_to), availability}]}`.

Both accept single dates or ranges, support bulk arrays in one call, return 200 with a task-tracking ID.

## Authentication

Custom header `user-api-key: <key>` on every request (not Bearer/OAuth). Keys generated once from the Organization page in the Channex dashboard, shown only at creation time, optionally scoped to specific properties.

## Staging vs production — CONFIRMED SANDBOX

Genuinely separate hosts, not a sandbox flag on one API:
- **Staging base URL:** `staging.channex.io` (confirmed directly in ARI docs' example requests)
- **Signup is free** — "no sales call and no card required"
- **Production** requires an active paid subscription + billing-owner permissions to even see the API-key feature, plus passing Channex's **PMS certification process** before going fully live (documented, typically cited as 2-4 weeks — this specific timeline figure wasn't independently re-confirmed on a second source, verify directly at the certification-tests doc before committing to a schedule)
- **Pricing confirmed accurate** against this project's existing assumption: $130/month base + $7/property/month (volume discounts to $4 at 2,000+ properties), no setup fee, billed monthly

## Multi-property structure

One account → multiple properties, each with its own UUID `property_id`, organized under a `group_id` (defaults to account's default group). Docs explicitly recommend never merging multiple physical hotels into one property record. Every ARI push item and most property-scoped endpoints require `property_id` — matches this project's ChannelMapping model (Phase 1), which should carry Channex's `property_id` per hotel.

## Rate limits / batching

- **20 ARI requests/minute total**: 10 Availability requests/min/property + 10 Restrictions/Price requests/min/property
- Max payload 10MB/call
- HTTP 429 (`http_too_many_requests`) on excess, recommended exponential backoff (~1 min pause)
- Channex's guidance: batch changes per property every 30-60 seconds, detect changes via event-driven mechanism (not polling), plus one full daily resync per property overnight

## Gaps not verified
- Whether a single `values` array can span multiple `property_id`s in one ARI call (field-per-item shape suggests yes, no doc states it outright)
- Exact PMS certification timeline beyond the cited "2-4 weeks" figure

## Sources
- https://docs.channex.io/
- https://docs.channex.io/api-v.1-documentation/ari
- https://docs.channex.io/application-documentation/api-key-access
- https://docs.channex.io/api-v.1-documentation/rate-limits
- https://docs.channex.io/guides/pms-integration-guide
- https://docs.channex.io/api-v.1-documentation/pms-certification-tests
- https://docs.channex.io/api-v.1-documentation/hotels-collection
- https://channex.io/start-integration
- https://channex.io/pricing
