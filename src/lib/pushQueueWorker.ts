import type { PushQueue } from "@prisma/client";
import { prisma } from "./prisma.js";
import { ChannexApiError, pushAvailability, pushRestrictions } from "./channex.js";

const MAX_ATTEMPTS = 5;
const TICK_INTERVAL_MS = 7_000; // 60/7 ≈ 8.6 ticks/min, safely under Channex's 10 req/min/property
// at one push per hotel per tick.

/**
 * Claims at most one PENDING row for a hotel via a single atomic UPDATE — the
 * check (status = 'PENDING') and the claim (status -> PROCESSING) are the same
 * statement, so two overlapping ticks (a slow push still running when the next
 * interval fires) can never both claim the same row. Same principle as this
 * project's existing conditional-UPDATE inventory guards (02-03, 04-01).
 */
async function claimNextPending(hotelId: string): Promise<PushQueue | null> {
  const rows = await prisma.$queryRaw<PushQueue[]>`
    UPDATE "PushQueue"
    SET status = 'PROCESSING'::"PushQueueStatus", "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "PushQueue"
      WHERE "hotelId" = ${hotelId} AND status = 'PENDING'::"PushQueueStatus"
      ORDER BY "createdAt" ASC
      LIMIT 1
    )
    AND status = 'PENDING'::"PushQueueStatus"
    RETURNING *
  `;
  return rows[0] ?? null;
}

/** Fresh read at push time — never trust anything cached when the row was enqueued. */
async function computeRateValue(ratePlanId: string): Promise<string | null> {
  const ratePlan = await prisma.ratePlan.findFirst({ where: { id: ratePlanId, deletedAt: null } });
  if (!ratePlan) return null;
  return (ratePlan.otaPrice ?? ratePlan.basePrice).toString();
}

/**
 * Fresh read at push time. Returns the MINIMUM free count across the row's
 * date range — conservative (never overstates availability for any date in
 * range). This project has no per-date availableCount variance yet (Room
 * OOS/CRUD isn't wired to availability — see the existing Deferred Issue); if
 * that changes, this minimum-across-range approach needs revisiting, not this
 * plan's job to solve now.
 */
async function computeAvailabilityValue(
  roomTypeId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<number | null> {
  const rows = await prisma.dailyInventory.findMany({
    where: { roomTypeId, date: { gte: dateFrom, lt: dateTo } },
  });
  if (rows.length === 0) return null;
  return Math.min(...rows.map((r) => r.availableCount - r.bookedCount - r.heldCount));
}

async function resolveExternalIds(
  hotelId: string,
  roomTypeId: string | null,
  ratePlanId: string | null
): Promise<{ propertyId: string; externalId: string } | null> {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { channexPropertyId: true } });
  if (!hotel?.channexPropertyId) return null;

  const mapping = await prisma.channelMapping.findFirst({
    where: {
      hotelId,
      deletedAt: null,
      ...(roomTypeId ? { mappingType: "ROOM_TYPE", roomTypeId } : { mappingType: "RATE_PLAN", ratePlanId }),
    },
  });
  if (!mapping) return null;

  return { propertyId: hotel.channexPropertyId, externalId: mapping.externalId };
}

async function markDone(id: string): Promise<void> {
  await prisma.pushQueue.update({ where: { id }, data: { status: "DONE" } });
}

async function markFailedOrRetry(id: string, attempts: number, error: string): Promise<void> {
  const nextAttempts = attempts + 1;
  await prisma.pushQueue.update({
    where: { id },
    data: {
      attempts: nextAttempts,
      lastError: error,
      status: nextAttempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
    },
  });
}

async function processRow(row: PushQueue): Promise<void> {
  const ids = await resolveExternalIds(row.hotelId, row.roomTypeId, row.ratePlanId);
  if (!ids) {
    await prisma.pushQueue.update({
      where: { id: row.id },
      data: { status: "FAILED", lastError: "No ChannelMapping/channexPropertyId at push time" },
    });
    return;
  }

  try {
    if (row.type === "RATE") {
      const rate = await computeRateValue(row.ratePlanId!);
      if (rate === null) {
        await prisma.pushQueue.update({
          where: { id: row.id },
          data: { status: "FAILED", lastError: "Rate plan no longer exists" },
        });
        return;
      }
      await pushRestrictions(ids.propertyId, ids.externalId, isoDate(row.dateFrom), isoDate(row.dateTo), rate);
    } else {
      const availability = await computeAvailabilityValue(row.roomTypeId!, row.dateFrom, row.dateTo);
      if (availability === null) {
        await prisma.pushQueue.update({
          where: { id: row.id },
          data: { status: "FAILED", lastError: "No DailyInventory rows for this range" },
        });
        return;
      }
      await pushAvailability(
        ids.propertyId,
        ids.externalId,
        isoDate(row.dateFrom),
        isoDate(row.dateTo),
        availability
      );
    }
    await markDone(row.id);
  } catch (err) {
    // A 429 still counts toward attempts — Task 2's tick cadence is designed
    // to stay under Channex's limit on its own; a 429 anyway is worth
    // surfacing via lastError, not silently absorbing forever.
    const message =
      err instanceof ChannexApiError ? `[${err.status}] ${err.body}` : err instanceof Error ? err.message : String(err);
    await markFailedOrRetry(row.id, row.attempts, message);
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runPushQueueTick(): Promise<void> {
  const hotels = await prisma.hotel.findMany({
    where: { channexPropertyId: { not: null }, deletedAt: null },
    select: { id: true },
  });

  for (const { id: hotelId } of hotels) {
    const row = await claimNextPending(hotelId);
    if (row) await processRow(row);
  }
}

export function startPushQueueWorker(): NodeJS.Timeout {
  return setInterval(() => {
    runPushQueueTick().catch((err) => {
      console.error("PushQueue worker tick error:", err instanceof Error ? err.message : err);
    });
  }, TICK_INTERVAL_MS);
}
