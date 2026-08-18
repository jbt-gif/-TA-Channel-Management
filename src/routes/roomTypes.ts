import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const roomTypesRouter = Router();

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400;
const MS_PER_DAY = 86_400_000;

function toUtcDateStringOrNull(input: string): string | null {
  if (!DATE_FORMAT.test(input)) return null;
  const parsed = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip check: rejects syntactically-valid-but-impossible dates like
  // 2026-02-30, which JS's lenient Date parsing would otherwise silently
  // roll over to March 2nd instead of erroring.
  const roundTripped = parsed.toISOString().slice(0, 10);
  return roundTripped === input ? input : null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

roomTypesRouter.get("/", requireAuth, async (req, res) => {
  try {
    const roomTypes = await prisma.roomType.findMany({
      where: { hotelId: req.auth!.hotelId, deletedAt: null },
      include: { ratePlans: { where: { deletedAt: null } } },
    });

    res.status(200).json(
      roomTypes.map((rt) => ({
        id: rt.id,
        name: rt.name,
        baseCapacity: rt.baseCapacity,
        ratePlans: rt.ratePlans.map((rp) => ({
          id: rp.id,
          name: rp.name,
          isRefundable: rp.isRefundable,
          includesBreakfast: rp.includesBreakfast,
        })),
      }))
    );
  } catch (err) {
    console.error("Room-types list error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});

roomTypesRouter.get("/:roomTypeId/calendar", requireAuth, async (req, res) => {
  const roomTypeId = req.params.roomTypeId as string;
  const { startDate: rawStart, endDate: rawEnd } = req.query;

  if (typeof rawStart !== "string" || typeof rawEnd !== "string") {
    res.status(400).json({ error: "startDate and endDate query parameters are required" });
    return;
  }

  const startDate = toUtcDateStringOrNull(rawStart);
  const endDate = toUtcDateStringOrNull(rawEnd);

  if (!startDate || !endDate) {
    res.status(400).json({ error: "startDate and endDate must be valid YYYY-MM-DD calendar dates" });
    return;
  }
  if (endDate < startDate) {
    res.status(400).json({ error: "endDate must not be before startDate" });
    return;
  }
  const spanDays =
    (new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) /
    MS_PER_DAY;
  if (spanDays > MAX_RANGE_DAYS) {
    res.status(400).json({ error: `Date range must not exceed ${MAX_RANGE_DAYS} days` });
    return;
  }

  // Everything from here on — the tenant-ownership check through the response —
  // is inside one try/catch. A transient DB error during the ownership check
  // itself must fail the same generic-500 way as an error during the data
  // queries, not produce an uncontrolled Express error response.
  try {
    const roomType = await prisma.roomType.findFirst({
      where: { id: roomTypeId, hotelId: req.auth!.hotelId, deletedAt: null },
    });

    if (!roomType) {
      // Same response whether roomTypeId doesn't exist at all or belongs to
      // another hotel — distinguishing the two is itself a tenant-isolation leak.
      res.status(404).json({ error: "Room type not found" });
      return;
    }

    const dateList: string[] = [];
    for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
      dateList.push(d);
    }

    const [inventoryRows, ratePlans] = await Promise.all([
      prisma.dailyInventory.findMany({
        where: { roomTypeId, date: { gte: new Date(`${startDate}T00:00:00.000Z`), lte: new Date(`${endDate}T00:00:00.000Z`) } },
      }),
      prisma.ratePlan.findMany({ where: { roomTypeId, deletedAt: null } }),
    ]);

    const ratePlanIds = ratePlans.map((rp) => rp.id);
    const rateRows = ratePlanIds.length
      ? await prisma.ratePlanDailyRate.findMany({
          where: {
            ratePlanId: { in: ratePlanIds },
            date: { gte: new Date(`${startDate}T00:00:00.000Z`), lte: new Date(`${endDate}T00:00:00.000Z`) },
          },
        })
      : [];

    const inventoryByDate = new Map(inventoryRows.map((row) => [row.date.toISOString().slice(0, 10), row]));
    const ratesByDate = new Map<string, Map<string, { price: unknown; minStay: number }>>();
    for (const rate of rateRows) {
      const dateKey = rate.date.toISOString().slice(0, 10);
      if (!ratesByDate.has(dateKey)) ratesByDate.set(dateKey, new Map());
      ratesByDate.get(dateKey)!.set(rate.ratePlanId, { price: rate.price, minStay: rate.minStay });
    }

    const days = dateList.map((date) => {
      const inv = inventoryByDate.get(date);
      const ratesForDate = ratesByDate.get(date);
      const rates: Record<string, { price: unknown; minStay: number }> = {};
      if (ratesForDate) {
        for (const [ratePlanId, rate] of ratesForDate) rates[ratePlanId] = rate;
      }
      return {
        date,
        seeded: Boolean(inv),
        availableCount: inv ? inv.availableCount : null,
        bookedCount: inv ? inv.bookedCount : null,
        heldCount: inv ? inv.heldCount : null,
        isClosed: inv ? inv.isClosed : null,
        rates,
      };
    });

    res.status(200).json({
      roomType: { id: roomType.id, name: roomType.name, baseCapacity: roomType.baseCapacity },
      ratePlans: ratePlans.map((rp) => ({
        id: rp.id,
        name: rp.name,
        isRefundable: rp.isRefundable,
        includesBreakfast: rp.includesBreakfast,
      })),
      days,
    });
  } catch (err) {
    console.error("Calendar grid error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});
