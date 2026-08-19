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
