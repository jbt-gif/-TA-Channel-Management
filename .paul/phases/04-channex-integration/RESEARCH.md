# Phase 4 Research: Channex Integration

**Date:** 2026-08-18
**Why:** ROADMAP.md flagged "Research: Likely — real Channex webhook payload shapes and ARI push format needed before finalizing, not assumed from the brief alone." Planning against guessed API shapes is against this project's own convention.

## Summary

Two research agents ran against Channex's official docs (docs.channex.io). Full findings in `research/incoming-webhooks.md` and `research/outgoing-ari-push.md`. Five facts materially shape the plan:

1. **Webhooks are thin notifications, not full data.** A `booking_new` webhook payload only contains `booking_id`, `property_id`, `revision_id` — the handler must then call `GET /api/v1/booking_revisions/:id` to pull the actual booking data (guest info, dates, rooms, price). This is a real architecture correction from ROADMAP.md's original wording ("webhook handler... atomic Prisma transaction" implied processing the webhook body directly) — the real flow is **webhook → pull full revision → then transact**.

2. **No HMAC signature verification exists.** Channex has no Stripe/GitHub-style cryptographic signing. Their own recommendation is a self-defined shared-secret header, checked on our side — matches ROADMAP.md's "secret header verification" wording, just confirms it's a plain shared secret, not HMAC.

3. **Webhook delivery order is explicitly not guaranteed**, and retries continue for up to ~24h on failure. Idempotency must key off `revision_id` (no built-in dedupe from Channex) — matches ROADMAP.md's "webhook idempotency (dedupe on retry)" scope item, now with a concrete key to use.

4. **ARI push is two separate rate-limited endpoints** (`/api/v1/restrictions` for rates/restrictions per rate-plan, `/api/v1/availability` per room-type), 10 requests/min/property each, with Channex's own recommended batching cadence (30-60s per property + nightly full resync) — this shapes the outgoing sync worker's design directly.

5. **Staging (`staging.channex.io`) is a genuinely separate, free environment** — confirmed sandbox to build/demo against, no card required. Production requires a paid plan (pricing confirmed accurate: $130/mo + $7/property) plus passing a PMS certification process before going live for real — new fact, not previously in PROJECT.md, worth a STATE.md/PROJECT.md note since it adds a real pre-launch step beyond "just flip to production."

## What this changes for the plan

- `POST /api/webhooks/channex` handler design: receive thin event → pull full revision via Channex's API → verify it maps to a known hotel/property (`ChannelMapping`) → run the same atomic conditional-UPDATE transaction pattern already proven in Phase 2's 02-03 (per STATE.md: "Conditional-UPDATE transaction pattern now proven and reusable by Phase 4's Channex booking_new webhook handler")
- Idempotency check keyed on `revision_id`, not a Channex-provided dedupe mechanism
- ARI push worker needs to respect the 10/min/property rate limit and batch on Channex's recommended cadence, not push on every single change instantly
- A `Hotel`/`ChannelMapping` field for Channex's `property_id` (UUID) is required — confirm this already exists from Phase 1's schema or needs adding
- Production go-live isn't just a config flip — PMS certification is a real gate to flag for Phase 7 (pre-launch) or whenever production Channex is first needed

## Gaps not resolved by research (flag in plan, don't guess)
- Whether one ARI call can mix multiple `property_id`s in its `values` array (undocumented — plan should assume "one property per call" as the safe default unless verified otherwise)
- Exact PMS certification timeline beyond an unconfirmed "2-4 weeks" figure

## Full findings
- `.paul/phases/04-channex-integration/research/incoming-webhooks.md`
- `.paul/phases/04-channex-integration/research/outgoing-ari-push.md`
