import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const bookingsRouter = Router();

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STAY_NIGHTS = 30;
const DUPLICATE_WINDOW_MS = 30_000;
const MS_PER_DAY = 86_400_000;
const BOOKING_ROLES = new Set(["FRONT_DESK", "HOTEL_ADMIN", "SUPER_ADMIN"]);
// Same body used whether roomTypeId/ratePlanId doesn't exist at all, belongs to
// another hotel, or the pair don't belong together — distinguishing them is
// itself a tenant-isolation leak (same pattern as roomTypes.ts).
const NOT_FOUND_BODY = { error: "Room type not found" };

function toUtcDateStringOrNull(input: string): string | null {
  if (!DATE_FORMAT.test(input)) return null;
  const parsed = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const roundTripped = parsed.toISOString().slice(0, 10);
  return roundTripped === input ? input : null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayManilaDateString(): string {
  const manilaMs = Date.now() + 8 * 60 * 60 * 1000;
  return new Date(manilaMs).toISOString().slice(0, 10);
}

class SoldOutError extends Error {}
class DuplicateSubmissionError extends Error {}

bookingsRouter.post("/", requireAuth, async (req, res) => {
  const { role, hotelId, userId } = req.auth!;

  if (!BOOKING_ROLES.has(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const body = req.body ?? {};
  const { roomTypeId, ratePlanId, checkInDate: rawCheckIn, checkOutDate: rawCheckOut, quantity, guest } = body;

  if (
    typeof roomTypeId !== "string" ||
    typeof ratePlanId !== "string" ||
    typeof rawCheckIn !== "string" ||
    typeof rawCheckOut !== "string" ||
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    !guest ||
    typeof guest !== "object" ||
    typeof guest.firstName !== "string" ||
    typeof guest.lastName !== "string" ||
    (guest.email !== undefined && typeof guest.email !== "string") ||
    (guest.phone !== undefined && typeof guest.phone !== "string")
  ) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const checkInDate = toUtcDateStringOrNull(rawCheckIn);
  const checkOutDate = toUtcDateStringOrNull(rawCheckOut);
  if (!checkInDate || !checkOutDate) {
    res.status(400).json({ error: "checkInDate and checkOutDate must be valid YYYY-MM-DD calendar dates" });
    return;
  }
  if (checkOutDate <= checkInDate) {
    res.status(400).json({ error: "checkOutDate must be after checkInDate" });
    return;
  }
  if (checkInDate < todayManilaDateString()) {
    res.status(400).json({ error: "checkInDate must not be in the past" });
    return;
  }

  const nights =
    (new Date(`${checkOutDate}T00:00:00.000Z`).getTime() - new Date(`${checkInDate}T00:00:00.000Z`).getTime()) /
    MS_PER_DAY;
  if (nights > MAX_STAY_NIGHTS) {
    res.status(400).json({ error: `Stay must not exceed ${MAX_STAY_NIGHTS} nights` });
    return;
  }

  const dateList: string[] = [];
  for (let d = checkInDate; d < checkOutDate; d = addDays(d, 1)) dateList.push(d);

  // Everything from here on — ownership check through the transaction — is
  // inside one try/catch, matching 02-01/02-02's discipline: a transient DB
  // error during the ownership check must fail the same generic-500 way as
  // an error during the transaction itself.
  try {
    const roomType = await prisma.roomType.findFirst({
      where: { id: roomTypeId, hotelId, deletedAt: null },
    });
    if (!roomType) {
      res.status(404).json(NOT_FOUND_BODY);
      return;
    }

    const ratePlan = await prisma.ratePlan.findFirst({
      where: { id: ratePlanId, hotelId, roomTypeId, deletedAt: null },
    });
    if (!ratePlan) {
      res.status(404).json(NOT_FOUND_BODY);
      return;
    }

    const rateRows = await prisma.ratePlanDailyRate.findMany({
      where: {
        ratePlanId,
        date: {
          gte: new Date(`${checkInDate}T00:00:00.000Z`),
          lt: new Date(`${checkOutDate}T00:00:00.000Z`),
        },
      },
    });

    // Never compute a total from a partial date range — a gap here must be a
    // hard stop, not a silently wrong (or NaN) total.
    if (rateRows.length < dateList.length) {
      res.status(409).json({ error: "Pricing unavailable for requested dates" });
      return;
    }

    const rateByDate = new Map(rateRows.map((r) => [r.date.toISOString().slice(0, 10), r.price]));
    // Decimal-safe summation (decimal.js via Prisma) — never native JS number
    // addition for money, to avoid silent floating-point drift on a financial
    // record.
    const nightlyTotal = dateList.reduce(
      (acc, date) => acc.plus(rateByDate.get(date)!),
      new Prisma.Decimal(0)
    );
    const totalAmount = nightlyTotal.times(quantity);

    const booking = await prisma.$transaction(async (tx) => {
      // Lightweight duplicate-submission guard (double-click / retry), not a
      // full idempotency-key system. Only checked when an email was given —
      // there's no other stable identifier to dedupe on without one.
      if (guest.email) {
        const duplicateCutoff = new Date(Date.now() - DUPLICATE_WINDOW_MS);
        const duplicate = await tx.booking.findFirst({
          where: {
            hotelId,
            createdAt: { gte: duplicateCutoff },
            guest: { email: guest.email },
            bookingItems: {
              some: {
                roomTypeId,
                checkInDate: new Date(`${checkInDate}T00:00:00.000Z`),
                checkOutDate: new Date(`${checkOutDate}T00:00:00.000Z`),
              },
            },
          },
        });
        if (duplicate) throw new DuplicateSubmissionError();
      }

      // Conditional atomic UPDATE per date — the check and the increment are
      // the same statement, so two concurrent requests racing for the last
      // room serialize on Postgres's native row lock instead of both reading
      // stale availability. If any date fails, throwing here rolls back every
      // increment already applied earlier in this same transaction.
      for (const date of dateList) {
        const dateObj = new Date(`${date}T00:00:00.000Z`);
        const affected = await tx.$executeRaw`
          UPDATE "DailyInventory"
          SET "bookedCount" = "bookedCount" + ${quantity}
          WHERE "hotelId" = ${hotelId}
            AND "roomTypeId" = ${roomTypeId}
            AND "date" = ${dateObj}
            AND "bookedCount" + "heldCount" + ${quantity} <= "availableCount"
        `;
        if (affected !== 1) throw new SoldOutError();
      }

      const guestRecord = guest.email
        ? ((await tx.guest.findFirst({ where: { hotelId, email: guest.email } })) ??
          (await tx.guest.create({
            data: {
              hotelId,
              firstName: guest.firstName,
              lastName: guest.lastName,
              email: guest.email,
              phone: guest.phone ?? null,
            },
          })))
        : await tx.guest.create({
            data: { hotelId, firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone ?? null },
          });

      return tx.booking.create({
        data: {
          hotelId,
          guestId: guestRecord.id,
          status: "CONFIRMED",
          source: "WALK_IN",
          createdByUserId: userId,
          totalAmount,
          bookingItems: {
            create: {
              hotelId,
              roomTypeId,
              ratePlanId,
              checkInDate: new Date(`${checkInDate}T00:00:00.000Z`),
              checkOutDate: new Date(`${checkOutDate}T00:00:00.000Z`),
              quantity,
              totalPriceSnapshot: totalAmount,
            },
          },
        },
        include: { bookingItems: true },
      });
    });

    // Enqueue an AVAILABILITY push AFTER the booking transaction has already
    // committed — a queue-insert failure here must never affect a booking
    // that already succeeded. Same reasoning as ratePlans.ts's rate enqueue.
    try {
      const mapping = await prisma.channelMapping.findFirst({
        where: { hotelId, mappingType: "ROOM_TYPE", roomTypeId, deletedAt: null },
      });
      const hotel = await prisma.hotel.findUnique({
        where: { id: hotelId },
        select: { channexPropertyId: true },
      });
      if (mapping && hotel?.channexPropertyId) {
        await prisma.pushQueue.create({
          data: {
            hotelId,
            type: "AVAILABILITY",
            roomTypeId,
            dateFrom: new Date(`${checkInDate}T00:00:00.000Z`),
            dateTo: new Date(`${checkOutDate}T00:00:00.000Z`),
          },
        });
      }
    } catch (err) {
      console.error("PushQueue enqueue error (availability):", err instanceof Error ? err.message : err);
    }

    res.status(201).json(booking);
  } catch (err) {
    if (err instanceof SoldOutError) {
      res.status(409).json({ error: "Room no longer available for requested dates" });
      return;
    }
    if (err instanceof DuplicateSubmissionError) {
      res.status(409).json({ error: "Duplicate booking submission" });
      return;
    }
    console.error("Booking creation error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});
