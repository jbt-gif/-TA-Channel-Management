import { prisma } from "../lib/prisma.js";
import { seedInventoryForRoomType } from "../lib/seed-inventory.js";

const SMOKE_HOTEL_NAME = "__smoke_test_inventory_hotel__";

function manilaTodayISODate(): string {
  const now = new Date();
  const manilaMs = now.getTime() + 8 * 60 * 60 * 1000;
  const manilaDate = new Date(manilaMs);
  return new Date(
    Date.UTC(manilaDate.getUTCFullYear(), manilaDate.getUTCMonth(), manilaDate.getUTCDate())
  ).toISOString();
}

async function main() {
  const existing = await prisma.hotel.findFirst({ where: { name: SMOKE_HOTEL_NAME } });
  if (existing) {
    await prisma.dailyInventory.deleteMany({ where: { hotelId: existing.id } });
    await prisma.ratePlanDailyRate.deleteMany({ where: { hotelId: existing.id } });
    await prisma.ratePlan.deleteMany({ where: { hotelId: existing.id } });
    await prisma.room.deleteMany({ where: { hotelId: existing.id } });
    await prisma.roomType.deleteMany({ where: { hotelId: existing.id } });
    await prisma.hotel.delete({ where: { id: existing.id } });
    console.log("Cleaned up previous inventory smoke-test run.");
  }

  const hotel = await prisma.hotel.create({ data: { name: SMOKE_HOTEL_NAME } });

  // RoomType A: 3 rooms, 2 rate plans — the main shared-inventory case
  const roomTypeA = await prisma.roomType.create({
    data: { hotelId: hotel.id, name: "Deluxe A", baseCapacity: 2 },
  });
  for (const label of ["A1", "A2", "A3"]) {
    await prisma.room.create({ data: { hotelId: hotel.id, roomTypeId: roomTypeA.id, label } });
  }
  const ratePlanRefundable = await prisma.ratePlan.create({
    data: {
      hotelId: hotel.id,
      roomTypeId: roomTypeA.id,
      name: "Refundable",
      isRefundable: true,
      includesBreakfast: false,
      basePrice: 3500,
    },
  });
  const ratePlanNonRefundable = await prisma.ratePlan.create({
    data: {
      hotelId: hotel.id,
      roomTypeId: roomTypeA.id,
      name: "Non-Refundable",
      isRefundable: false,
      includesBreakfast: false,
      basePrice: 3000,
    },
  });

  // RoomType B: zero rooms — the edge case
  const roomTypeB = await prisma.roomType.create({
    data: { hotelId: hotel.id, name: "Empty Room Type", baseCapacity: 2 },
  });

  // --- Run 1 ---
  const runA1 = await seedInventoryForRoomType(roomTypeA.id);
  const runB1 = await seedInventoryForRoomType(roomTypeB.id);
  console.log("Run 1 — RoomType A:", runA1);
  console.log("Run 1 — RoomType B (zero rooms):", runB1);

  const inventoryA = await prisma.dailyInventory.findMany({
    where: { roomTypeId: roomTypeA.id },
    orderBy: { date: "asc" },
  });
  const inventoryB = await prisma.dailyInventory.findMany({
    where: { roomTypeId: roomTypeB.id },
  });
  const ratesRefundable = await prisma.ratePlanDailyRate.findMany({
    where: { ratePlanId: ratePlanRefundable.id },
  });
  const ratesNonRefundable = await prisma.ratePlanDailyRate.findMany({
    where: { ratePlanId: ratePlanNonRefundable.id },
  });

  const checks: Array<[string, boolean]> = [
    ["AC-1: exactly 365 DailyInventory rows for RoomType A", inventoryA.length === 365],
    ["AC-1: all RoomType A rows have availableCount 3 (shared, not per rate plan)", inventoryA.every((r) => r.availableCount === 3)],
    ["AC-2: exactly 365 RatePlanDailyRate rows for Refundable plan", ratesRefundable.length === 365],
    ["AC-2: exactly 365 RatePlanDailyRate rows for Non-Refundable plan", ratesNonRefundable.length === 365],
    ["AC-2: Refundable rate price matches basePrice 3500", ratesRefundable.every((r) => Number(r.price) === 3500)],
    ["AC-2: Non-Refundable rate price matches basePrice 3000", ratesNonRefundable.every((r) => Number(r.price) === 3000)],
    ["AC-3: earliest DailyInventory date matches Manila today", inventoryA[0]?.date.toISOString() === manilaTodayISODate()],
    ["AC-6: RoomType B (zero rooms) produced 365 rows at availableCount 0", inventoryB.length === 365 && inventoryB.every((r) => r.availableCount === 0)],
  ];

  // --- Run 2 (idempotency) ---
  const runA2 = await seedInventoryForRoomType(roomTypeA.id);
  const runB2 = await seedInventoryForRoomType(roomTypeB.id);
  console.log("Run 2 — RoomType A:", runA2);
  console.log("Run 2 — RoomType B:", runB2);

  checks.push(
    ["AC-4: Run 2 for RoomType A created 0 new rows", runA2.daysCreated === 0],
    ["AC-4: Run 2 for RoomType A skipped all 365", runA2.daysSkipped === 365],
    ["AC-4: Run 2 for RoomType B created 0 new rows", runB2.daysCreated === 0],
    ["AC-4: Run 2 for RoomType B skipped all 365", runB2.daysSkipped === 365]
  );

  let allPassed = true;
  for (const [label, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"} — ${label}`);
    if (!passed) allPassed = false;
  }

  if (!allPassed) {
    process.exitCode = 1;
    throw new Error("One or more checks failed — see FAIL lines above.");
  }

  console.log("All inventory smoke-test checks passed.");
}

main()
  .catch((err) => {
    console.error("Inventory smoke test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
