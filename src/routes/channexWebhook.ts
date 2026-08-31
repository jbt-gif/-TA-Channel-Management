import express, { Router } from "express";
import * as Sentry from "@sentry/node";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { pullBookingRevision, verifyWebhookSecret, ChannexApiError, type ChannexBookingRevision } from "../lib/channex.js";

export const channexWebhookRouter = Router();

const HANDLED_EVENTS = new Set(["booking_new", "booking_modification", "booking_cancellation"]);
const MS_PER_DAY = 86_400_000;

class SoldOutError extends Error {}
class ConcurrentReleaseError extends Error {}
class MalformedRevisionError extends Error {}
class UnmappedResourceError extends Error {
  constructor(public externalId: string, public mappingType: "ROOM_TYPE" | "RATE_PLAN") {
    super(`No ChannelMapping for ${mappingType} external id ${externalId}`);
  }
}

function log(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
}

function dateRange(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const end = new Date(`${checkOut}T00:00:00.000Z`).getTime();
  for (let t = new Date(`${checkIn}T00:00:00.000Z`).getTime(); t < end; t += MS_PER_DAY) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

function validateRevision(rev: ChannexBookingRevision): void {
  if (!Array.isArray(rev.rooms) || rev.rooms.length === 0) {
    throw new MalformedRevisionError("rooms[] missing or empty");
  }
  for (const room of rev.rooms) {
    if (!room.room_type_id || !room.rate_plan_id || !room.checkin_date || !room.checkout_date) {
      throw new MalformedRevisionError("room entry missing room_type_id/rate_plan_id/checkin_date/checkout_date");
    }
  }
}

function guestEmailOrUndefined(rev: ChannexBookingRevision): string | undefined {
  const mail = rev.customer?.mail;
  return mail && mail.trim() !== "" ? mail : undefined;
}

interface MappedRoom {
  roomTypeId: string;
  ratePlanId: string;
  checkInDate: string;
  checkOutDate: string;
  amount: string;
}

async function mapRooms(hotelId: string, rev: ChannexBookingRevision): Promise<MappedRoom[]> {
  const mapped: MappedRoom[] = [];
  for (const room of rev.rooms) {
    const roomTypeMapping = await prisma.channelMapping.findFirst({
      where: { hotelId, mappingType: "ROOM_TYPE", externalId: room.room_type_id, deletedAt: null },
    });
    if (!roomTypeMapping?.roomTypeId) throw new UnmappedResourceError(room.room_type_id, "ROOM_TYPE");

    const ratePlanMapping = await prisma.channelMapping.findFirst({
      where: { hotelId, mappingType: "RATE_PLAN", externalId: room.rate_plan_id, deletedAt: null },
    });
    if (!ratePlanMapping?.ratePlanId) throw new UnmappedResourceError(room.rate_plan_id, "RATE_PLAN");

    mapped.push({
      roomTypeId: roomTypeMapping.roomTypeId,
      ratePlanId: ratePlanMapping.ratePlanId,
      checkInDate: room.checkin_date,
      checkOutDate: room.checkout_date,
      amount: room.amount,
    });
  }
  return mapped;
}

async function incrementInventory(
  tx: Prisma.TransactionClient,
  hotelId: string,
  roomTypeId: string,
  dates: string[]
): Promise<void> {
  for (const date of dates) {
    const dateObj = new Date(`${date}T00:00:00.000Z`);
    const affected = await tx.$executeRaw`
      UPDATE "DailyInventory"
      SET "bookedCount" = "bookedCount" + 1
      WHERE "hotelId" = ${hotelId}
        AND "roomTypeId" = ${roomTypeId}
        AND "date" = ${dateObj}
        AND "bookedCount" + "heldCount" + 1 <= "availableCount"
    `;
    if (affected !== 1) throw new SoldOutError();
  }
}

async function decrementInventory(
  tx: Prisma.TransactionClient,
  hotelId: string,
  roomTypeId: string,
  dates: string[],
  quantity: number
): Promise<void> {
  for (const date of dates) {
    const dateObj = new Date(`${date}T00:00:00.000Z`);
    // Guarded like incrementInventory — a concurrent cancellation/modification
    // for the SAME booking racing this one would otherwise decrement twice and
    // hit the DailyInventory_counts_check CHECK constraint as a raw, uncaught
    // 500 instead of a clean idempotent no-op.
    const affected = await tx.$executeRaw`
      UPDATE "DailyInventory"
      SET "bookedCount" = "bookedCount" - ${quantity}
      WHERE "hotelId" = ${hotelId}
        AND "roomTypeId" = ${roomTypeId}
        AND "date" = ${dateObj}
        AND "bookedCount" - ${quantity} >= 0
    `;
    if (affected !== 1) throw new ConcurrentReleaseError();
  }
}

async function findOrCreateGuest(tx: Prisma.TransactionClient, hotelId: string, rev: ChannexBookingRevision) {
  const email = guestEmailOrUndefined(rev);
  const firstName = rev.customer?.name || "Guest";
  const lastName = rev.customer?.surname || "";
  const phone = rev.customer?.phone || null;
  if (email) {
    const existing = await tx.guest.findFirst({ where: { hotelId, email } });
    if (existing) return existing;
    return tx.guest.create({ data: { hotelId, firstName, lastName, email, phone } });
  }
  return tx.guest.create({ data: { hotelId, firstName, lastName, phone } });
}

function bookingItemsCreateInput(hotelId: string, mappedRooms: MappedRoom[]) {
  return mappedRooms.map((room) => ({
    hotelId,
    roomTypeId: room.roomTypeId,
    ratePlanId: room.ratePlanId,
    checkInDate: new Date(`${room.checkInDate}T00:00:00.000Z`),
    checkOutDate: new Date(`${room.checkOutDate}T00:00:00.000Z`),
    quantity: 1,
    totalPriceSnapshot: new Prisma.Decimal(room.amount),
  }));
}

channexWebhookRouter.post("/", express.json({ limit: "256kb" }), async (req, res) => {
  let hotelId: string | null = null;
  let event: string | null = null;
  let revisionId: string | null = null;
  let bookingId: string | null = null;

  try {
    if (!verifyWebhookSecret(req)) {
      log({ hotelId, event, revisionId, outcome: "unauthorized" });
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = req.body ?? {};
    event = typeof body.event === "string" ? body.event : null;
    const payload = body.payload ?? {};
    revisionId = typeof payload.revision_id === "string" ? payload.revision_id : null;
    bookingId = typeof payload.booking_id === "string" ? payload.booking_id : null;
    const propertyId =
      typeof body.property_id === "string"
        ? body.property_id
        : typeof payload.property_id === "string"
          ? payload.property_id
          : null;

    if (!event || !HANDLED_EVENTS.has(event)) {
      log({ hotelId, event, revisionId, outcome: "ignored-event-type" });
      res.status(200).json({ ok: true });
      return;
    }

    if (!revisionId || !bookingId || !propertyId) {
      log({ hotelId, event, revisionId, outcome: "malformed-payload" });
      res.status(400).json({ error: "Malformed webhook payload" });
      return;
    }

    const hotel = await prisma.hotel.findFirst({ where: { channexPropertyId: propertyId, deletedAt: null } });
    if (!hotel) {
      log({ hotelId: null, event, revisionId, outcome: "unmapped-property" });
      res.status(200).json({ ok: true });
      return;
    }
    hotelId = hotel.id;

    // Idempotency for booking_new retries — keyed on the per-EVENT revisionId,
    // not the stable booking_id (a genuinely new booking_new for a returning
    // reservation would share nothing with a prior one anyway).
    const existingByRevision = await prisma.booking.findFirst({
      where: { hotelId, externalBookingId: revisionId },
    });
    if (existingByRevision && event === "booking_new") {
      log({ hotelId, event, revisionId, outcome: "duplicate-no-op" });
      res.status(200).json({ ok: true });
      return;
    }

    // Cancellation/modification target "the existing booking for this reservation"
    // — Channex issues a NEW revision_id per event, only booking_id is stable
    // across a reservation's lifecycle, so lookups for these two event types must
    // key on booking_id, not revisionId.
    const existingByBookingId = await prisma.booking.findFirst({
      where: { hotelId, channexBookingId: bookingId },
      include: { bookingItems: true },
    });

    const revision = await pullBookingRevision(revisionId);
    validateRevision(revision);
    // The pulled revision is the source of truth — confirm it actually belongs to
    // the property we resolved hotelId from, not just trust the webhook payload's
    // own property_id claim.
    if (revision.property_id !== propertyId) {
      log({ hotelId, event, revisionId, outcome: "property-id-mismatch" });
      res.status(422).json({ error: "Revision property_id does not match webhook payload" });
      return;
    }
    const mappedRooms = await mapRooms(hotelId, revision);

    if (event === "booking_new") {
      try {
        const booking = await prisma.$transaction(async (tx) => {
          const guest = await findOrCreateGuest(tx, hotelId!, revision);
          for (const room of mappedRooms) {
            await incrementInventory(tx, hotelId!, room.roomTypeId, dateRange(room.checkInDate, room.checkOutDate));
          }
          return tx.booking.create({
            data: {
              hotelId: hotelId!,
              guestId: guest.id,
              status: "CONFIRMED",
              source: "OTA",
              externalBookingId: revisionId!,
              channexBookingId: bookingId!,
              // System-created from a Channex webhook, no human staff member initiated it.
              createdByUserId: null,
              totalAmount: new Prisma.Decimal(revision.amount),
              bookingItems: { create: bookingItemsCreateInput(hotelId!, mappedRooms) },
            },
            include: { bookingItems: true },
          });
        });
        log({ hotelId, event, revisionId, outcome: "created", bookingId: booking.id });
        res.status(200).json({ ok: true });
        return;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          log({ hotelId, event, revisionId, outcome: "duplicate-race-no-op" });
          res.status(200).json({ ok: true });
          return;
        }
        if (err instanceof SoldOutError) {
          log({ hotelId, event, revisionId, outcome: "sync-conflict-sold-out" });
          res.status(200).json({ ok: true });
          return;
        }
        throw err;
      }
    }

    if (event === "booking_cancellation") {
      if (!existingByBookingId) {
        log({ hotelId, event, revisionId, outcome: "cancel-no-existing-booking" });
        res.status(200).json({ ok: true });
        return;
      }
      if (existingByBookingId.status === "CANCELLED") {
        log({ hotelId, event, revisionId, outcome: "already-cancelled" });
        res.status(200).json({ ok: true });
        return;
      }
      try {
        await prisma.$transaction(async (tx) => {
          for (const item of existingByBookingId.bookingItems) {
            await decrementInventory(
              tx,
              hotelId!,
              item.roomTypeId,
              dateRange(item.checkInDate.toISOString().slice(0, 10), item.checkOutDate.toISOString().slice(0, 10)),
              item.quantity
            );
          }
          await tx.booking.update({ where: { id: existingByBookingId.id }, data: { status: "CANCELLED" } });
        });
      } catch (err) {
        if (err instanceof ConcurrentReleaseError) {
          // A concurrent retry of this same cancellation already released this
          // inventory and flipped the status — idempotent no-op, not a real error.
          log({ hotelId, event, revisionId, outcome: "cancel-race-no-op", bookingId: existingByBookingId.id });
          res.status(200).json({ ok: true });
          return;
        }
        throw err;
      }
      log({ hotelId, event, revisionId, outcome: "cancelled", bookingId: existingByBookingId.id });
      res.status(200).json({ ok: true });
      return;
    }

    // booking_modification
    if (!existingByBookingId) {
      log({ hotelId, event, revisionId, outcome: "modification-no-existing-booking" });
      res.status(200).json({ ok: true });
      return;
    }

    const unchanged =
      mappedRooms.length === existingByBookingId.bookingItems.length &&
      mappedRooms.every((room) =>
        existingByBookingId.bookingItems.some(
          (item) =>
            item.roomTypeId === room.roomTypeId &&
            item.ratePlanId === room.ratePlanId &&
            item.checkInDate.toISOString().slice(0, 10) === room.checkInDate &&
            item.checkOutDate.toISOString().slice(0, 10) === room.checkOutDate
        )
      );

    if (unchanged) {
      await prisma.booking.update({
        where: { id: existingByBookingId.id },
        data: { totalAmount: new Prisma.Decimal(revision.amount) },
      });
      log({ hotelId, event, revisionId, outcome: "modified-amount-only", bookingId: existingByBookingId.id });
      res.status(200).json({ ok: true });
      return;
    }

    // Room/date change (AC-10): cancel-old + create-new inside one transaction.
    // The old booking's externalBookingId gets a superseded suffix so the new
    // booking can take the canonical revisionId — future retries/lookups for
    // this revision must resolve to the CURRENT active booking, never the
    // stale cancelled one.
    try {
      const replacement = await prisma.$transaction(async (tx) => {
        for (const item of existingByBookingId.bookingItems) {
          await decrementInventory(
            tx,
            hotelId!,
            item.roomTypeId,
            dateRange(item.checkInDate.toISOString().slice(0, 10), item.checkOutDate.toISOString().slice(0, 10)),
            item.quantity
          );
        }
        await tx.booking.update({
          where: { id: existingByBookingId.id },
          data: {
            status: "CANCELLED",
            externalBookingId: `${revisionId}::superseded::${existingByBookingId.id}`,
            channexBookingId: `${bookingId}::superseded::${existingByBookingId.id}`,
          },
        });

        for (const room of mappedRooms) {
          await incrementInventory(tx, hotelId!, room.roomTypeId, dateRange(room.checkInDate, room.checkOutDate));
        }

        const guest = await findOrCreateGuest(tx, hotelId!, revision);
        return tx.booking.create({
          data: {
            hotelId: hotelId!,
            guestId: guest.id,
            status: "CONFIRMED",
            source: "OTA",
            externalBookingId: revisionId!,
            channexBookingId: bookingId!,
            createdByUserId: null,
            totalAmount: new Prisma.Decimal(revision.amount),
            bookingItems: { create: bookingItemsCreateInput(hotelId!, mappedRooms) },
          },
          include: { bookingItems: true },
        });
      });
      log({
        hotelId,
        event,
        revisionId,
        outcome: "modified-replaced",
        bookingId: replacement.id,
        previousBookingId: existingByBookingId.id,
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // A concurrent retry of this same modification event beat us to it —
        // idempotent no-op, matching booking_new's P2002 handling.
        log({ hotelId, event, revisionId, outcome: "duplicate-race-no-op", previousBookingId: existingByBookingId.id });
        res.status(200).json({ ok: true });
        return;
      }
      if (err instanceof ConcurrentReleaseError) {
        // A concurrent cancellation/modification of the same booking already
        // released its inventory — idempotent no-op, not a real error.
        log({ hotelId, event, revisionId, outcome: "modification-race-no-op", previousBookingId: existingByBookingId.id });
        res.status(200).json({ ok: true });
        return;
      }
      if (err instanceof SoldOutError) {
        log({
          hotelId,
          event,
          revisionId,
          outcome: "modification-sold-out-rolled-back",
          previousBookingId: existingByBookingId.id,
        });
        res.status(200).json({ ok: true });
        return;
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof UnmappedResourceError) {
      log({ hotelId, event, revisionId, outcome: "unmapped-resource", detail: err.message });
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof MalformedRevisionError) {
      log({ hotelId, event, revisionId, outcome: "malformed-revision", detail: err.message });
      res.status(422).json({ error: err.message });
      return;
    }
    if (err instanceof ChannexApiError) {
      log({ hotelId, event, revisionId, outcome: "channex-api-error", detail: err.message });
      Sentry.captureException(err);
      res.status(500).json({ error: "Channex API error" });
      return;
    }
    log({ hotelId, event, revisionId, outcome: "internal-error", detail: err instanceof Error ? err.message : err });
    Sentry.captureException(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
