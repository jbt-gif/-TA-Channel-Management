# Research: Channex Incoming Webhooks

**Researched:** 2026-08-18
**Method:** WebSearch/WebFetch against docs.channex.io, cross-verified via raw `.md` doc fetches (docs.channex.io supports a `.md` suffix on any page).

## Event types

Full webhook event catalog (`docs.channex.io/api-v.1-documentation/webhook-collection`):
- `booking` — fires for ANY booking revision (new, modified, or cancelled)
- `booking_new` — fires only when revision status is `new`
- `booking_modification` — fires only when status is `modified`
- `booking_cancellation` — fires only when status is `cancelled`
- `booking_unmapped_room` / `booking_unmapped_rate` — mapping failures
- `non_acked_booking` — revision not acknowledged 30 min after receipt
- Plus `ari`, `message`, `sync_error`, `sync_warning`, `rate_error`, Airbnb-specific events, `review`, channel lifecycle events

`event_mask` on the webhook subscription accepts `*` or a semicolon-separated list, e.g. `"booking_new;booking_modification;booking_cancellation"`.

## Payload shape — CRITICAL FINDING

**The webhook is a thin notification, not the full booking.** `booking`/`booking_new` payload:

```json
{
  "event": "booking_new",
  "payload": {
    "booking_id": "e10de9d1-3e2c-431c-b88c-ffca9ed5db5d",
    "property_id": "90958ec0-9713-1196-873e-4add0d834670",
    "revision_id": "80b3b60c-5e24-35c5-ad1b-da67cd704093"
  },
  "property_id": "90958ec0-9713-1396-873e-4add0d834670",
  "user_id": null,
  "timestamp": "2021-12-24T00:00:00.0000Z"
}
```

Channex's own docs: "This event was originally designed to trigger a Pull booking revision operation... we expect the PMS will call `api/v1/booking_revisions/:id`, to pull the new revision and ack it."

If the webhook config has `send_data: false`, even the `payload` object is stripped down to just `event`, `user_id`, `property_id`, `timestamp`.

**Full Booking Revision object** (fetched via the pull call, `GET /api/v1/booking_revisions/:id`): `id`, `property_id`, `booking_id`, `unique_id`, `ota_reservation_code`, `ota_name`, `status` (`new`/`modified`/`cancelled`), `arrival_date`, `departure_date`, `arrival_hour`, `amount`, `currency`, `notes`, `payment_collect`, `payment_type`, `ota_commission`, `inserted_at`, `occupancy` (adults/children/infants), `customer` (name, surname, mail, phone, address, city, zip, country, language, company), `guarantee` (masked card details), `services`, and `rooms[]` — each room carrying `room_type_id`, `rate_plan_id`, `checkin_date`, `checkout_date`, `amount`, `days` (price breakdown), `occupancy`, `guests[]`.

## Signature / authentication verification

Channex does **not** provide HMAC signing (no Stripe/GitHub-style signature header). Their own recommendation: HTTPS-only endpoint, a **custom shared-secret header you invent yourself** (set via the webhook's `headers` field at creation — e.g. a header like `X-Channex-Webhook-Secret: <your-random-value>`), optional IP allowlisting, and your own replay/idempotency handling. There is no standard Channex-issued verification header — this project has to define its own convention.

## Delivery guarantees

- Retries on 5xx: exponential backoff, max 10 attempts over ~24h (1min→2→4→8→15→30min→1h→2h→4h→6h→10h)
- Endpoint should return 200 even if internal processing later fails
- **Delivery order NOT guaranteed** — Channex's own docs: "Sequence of incoming webhook calls can be different from sequence of events which trigger that calls." Treat the webhook purely as a trigger to pull current state, don't trust payload arrival order.
- No built-in dedupe/event-ID mechanism on Channex's end — `revision_id` on the Booking Revision object is the closest thing to an idempotency key to track ourselves.

## Registration

Both dashboard and API:
- Dashboard: property-level (`.../organization/webhooks/property`), global (`.../organization/webhooks/global`)
- API: `POST /webhooks` (create — requires `callback_url`, `event_mask`, `property_id`; set `property_id: null` + `is_global: true` for account-wide webhooks, relevant to our single-account/multi-property model), `PUT /webhooks/{id}`, `GET /webhooks`, `DELETE /webhooks/{id}`, `POST /webhooks/test`

## Sources
- https://docs.channex.io/api-v.1-documentation/webhook-collection
- https://docs.channex.io/api-v.1-documentation/bookings-collection
- https://docs.channex.io/guides/pms-integration-guide
- https://docs.channex.io/llms.txt
