import type { Request } from "express";
import { timingSafeEqual } from "crypto";

const WEBHOOK_SECRET_HEADER = "x-channex-webhook-secret";

export class ChannexApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Channex API error ${status}: ${body}`);
  }
}

export interface ChannexBookingRevision {
  id: string;
  /// Channex's stable per-reservation id — unlike `id` (the revision id), this
  /// stays the same across new/modification/cancellation events for one booking.
  booking_id: string;
  property_id: string;
  status: string;
  arrival_date: string;
  departure_date: string;
  amount: string;
  currency: string;
  customer: {
    name?: string | null;
    surname?: string | null;
    mail?: string | null;
    phone?: string | null;
  };
  rooms: Array<{
    room_type_id: string;
    rate_plan_id: string;
    checkin_date: string;
    checkout_date: string;
    amount: string;
  }>;
}

/**
 * Compares the x-channex-webhook-secret header against CHANNEX_WEBHOOK_SECRET.
 * Constant-time — matches this project's timing-attack precedent from 02-01's
 * bcrypt fix; a naive === compare leaks how many leading characters matched.
 */
export function verifyWebhookSecret(req: Request): boolean {
  const expected = process.env.CHANNEX_WEBHOOK_SECRET;
  const received = req.header(WEBHOOK_SECRET_HEADER);
  if (!expected || !received) return false;

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

export async function pullBookingRevision(revisionId: string): Promise<ChannexBookingRevision> {
  const apiKey = process.env.CHANNEX_API_KEY;
  const baseUrl = process.env.CHANNEX_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error("CHANNEX_API_KEY/CHANNEX_BASE_URL not configured");
  }

  const res = await fetch(`${baseUrl}/api/v1/booking_revisions/${revisionId}`, {
    headers: { "user-api-key": apiKey },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ChannexApiError(res.status, body);
  }

  const json = (await res.json()) as { data: { id: string; attributes: ChannexBookingRevision } };
  return { ...json.data.attributes, id: json.data.id };
}

/**
 * Pushes room-type availability for a date range to Channex's real staging API.
 * No rate-limiting/batching/retry here — Channex's documented limit is 10
 * req/min/property; respecting that under real, frequent mutation traffic is
 * 04-03's job, not this thin client's. A 429 surfaces via ChannexApiError.status,
 * same as any other non-2xx — callers can distinguish rate-limiting from other
 * failures by checking that field.
 */
export async function pushAvailability(
  propertyId: string,
  roomTypeId: string,
  dateFrom: string,
  dateTo: string,
  availability: number
): Promise<void> {
  const apiKey = process.env.CHANNEX_API_KEY;
  const baseUrl = process.env.CHANNEX_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error("CHANNEX_API_KEY/CHANNEX_BASE_URL not configured");
  }

  const res = await fetch(`${baseUrl}/api/v1/availability`, {
    method: "POST",
    headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      values: [{ property_id: propertyId, room_type_id: roomTypeId, date_from: dateFrom, date_to: dateTo, availability }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ChannexApiError(res.status, body);
  }

  // Channex returns 200 even when a per-item change couldn't be applied (e.g. an
  // unmapped room_type_id) — the actual failure is only visible in meta.warnings,
  // confirmed live against the real staging API. Treating a 200-with-warnings as
  // success would be exactly the silent-failure this project's conventions forbid.
  const json = (await res.json()) as { meta?: { warnings?: unknown[] } };
  if (json.meta?.warnings && json.meta.warnings.length > 0) {
    throw new ChannexApiError(422, JSON.stringify(json.meta.warnings));
  }
}

/**
 * Pushes a rate-plan rate for a date range to Channex's real staging API.
 * Same no-rate-limiting scope note as pushAvailability.
 */
export async function pushRestrictions(
  propertyId: string,
  ratePlanId: string,
  dateFrom: string,
  dateTo: string,
  rate: string
): Promise<void> {
  const apiKey = process.env.CHANNEX_API_KEY;
  const baseUrl = process.env.CHANNEX_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error("CHANNEX_API_KEY/CHANNEX_BASE_URL not configured");
  }

  const res = await fetch(`${baseUrl}/api/v1/restrictions`, {
    method: "POST",
    headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      values: [{ property_id: propertyId, rate_plan_id: ratePlanId, date_from: dateFrom, date_to: dateTo, rate }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ChannexApiError(res.status, body);
  }

  // Same 200-with-warnings behavior as pushAvailability, confirmed live for this
  // endpoint too (e.g. an unmapped rate_plan_id) — see that function's comment.
  const json = (await res.json()) as { meta?: { warnings?: unknown[] } };
  if (json.meta?.warnings && json.meta.warnings.length > 0) {
    throw new ChannexApiError(422, JSON.stringify(json.meta.warnings));
  }
}
