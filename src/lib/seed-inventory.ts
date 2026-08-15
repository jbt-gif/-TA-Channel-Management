import { prisma } from "./prisma.js";

const DAYS_TO_SEED = 365;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Manila is UTC+8, no DST

/**
 * Returns today's calendar date in Asia/Manila as a UTC-midnight Date,
 * matching the shape Prisma expects for a @db.Date column.
 */
function getManilaToday(): Date {
  const now = new Date();
  const manilaMs = now.getTime() + MANILA_OFFSET_MS;
  const manilaDate = new Date(manilaMs);
  return new Date(
    Date.UTC(manilaDate.getUTCFullYear(), manilaDate.getUTCMonth(), manilaDate.getUTCDate())
  );
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function seedInventoryForRoomType(
  roomTypeId: string
): Promise<{ daysCreated: number; daysSkipped: number }> {
  const roomType = await prisma.roomType.findUniqueOrThrow({ where: { id: roomTypeId } });
  const availableCount = await prisma.room.count({
    where: { roomTypeId, deletedAt: null },
  });
  const ratePlans = await prisma.ratePlan.findMany({
    where: { roomTypeId, deletedAt: null },
  });

  const today = getManilaToday();
  const dates = Array.from({ length: DAYS_TO_SEED }, (_, i) => addDays(today, i));

  const existingInventory = await prisma.dailyInventory.findMany({
    where: { roomTypeId, date: { in: dates } },
    select: { date: true },
  });
  const existingInventoryDates = new Set(
    existingInventory.map((row) => row.date.toISOString())
  );

  const inventoryRowsToCreate = dates
    .filter((date) => !existingInventoryDates.has(date.toISOString()))
    .map((date) => ({
      hotelId: roomType.hotelId,
      roomTypeId,
      date,
      availableCount,
      bookedCount: 0,
      heldCount: 0,
      isClosed: false,
    }));

  let daysCreated = 0;
  let daysSkipped = dates.length - inventoryRowsToCreate.length;

  if (inventoryRowsToCreate.length > 0) {
    const result = await prisma.dailyInventory.createMany({
      data: inventoryRowsToCreate,
      skipDuplicates: true,
    });
    daysCreated = result.count;
    daysSkipped += inventoryRowsToCreate.length - result.count;
  }

  for (const ratePlan of ratePlans) {
    const existingRates = await prisma.ratePlanDailyRate.findMany({
      where: { ratePlanId: ratePlan.id, date: { in: dates } },
      select: { date: true },
    });
    const existingRateDates = new Set(existingRates.map((row) => row.date.toISOString()));

    const rateRowsToCreate = dates
      .filter((date) => !existingRateDates.has(date.toISOString()))
      .map((date) => ({
        hotelId: ratePlan.hotelId,
        ratePlanId: ratePlan.id,
        date,
        price: ratePlan.basePrice,
        minStay: 1,
      }));

    if (rateRowsToCreate.length > 0) {
      await prisma.ratePlanDailyRate.createMany({
        data: rateRowsToCreate,
        skipDuplicates: true,
      });
    }
  }

  return { daysCreated, daysSkipped };
}
