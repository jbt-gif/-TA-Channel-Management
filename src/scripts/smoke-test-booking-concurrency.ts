import bcrypt from "bcryptjs";
import type { AddressInfo } from "node:net";
import { app } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { seedInventoryForRoomType } from "../lib/seed-inventory.js";

const HOTEL_NAME = "__smoke_test_booking_concurrency_hotel__";
const TEST_EMAIL = "bookingconcurrencysmoketest@smoke-test.local";
const TEST_PASSWORD = "BookingConcurrencySmokeTest123!";
const CONCURRENT_REQUESTS = 50;

async function cleanup() {
  const hotel = await prisma.hotel.findFirst({ where: { name: HOTEL_NAME } });
  if (!hotel) return;
  await prisma.payment.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.bookingItem.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.booking.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.guest.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.dailyInventory.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.ratePlanDailyRate.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.ratePlan.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.room.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.roomType.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.user.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.hotel.delete({ where: { id: hotel.id } });
}

function tomorrowManilaStr(): string {
  const manilaMs = Date.now() + 8 * 60 * 60 * 1000;
  const d = new Date(manilaMs);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  await cleanup();

  const hotel = await prisma.hotel.create({ data: { name: HOTEL_NAME } });
  const roomType = await prisma.roomType.create({
    data: { hotelId: hotel.id, name: "LastRoom", baseCapacity: 2 },
  });
  // Exactly one physical room — the actual race condition this plan exists to prevent.
  await prisma.room.create({ data: { hotelId: hotel.id, roomTypeId: roomType.id, label: "101" } });
  const ratePlan = await prisma.ratePlan.create({
    data: {
      hotelId: hotel.id,
      roomTypeId: roomType.id,
      name: "Standard",
      isRefundable: true,
      includesBreakfast: false,
      basePrice: 2000,
    },
  });
  await seedInventoryForRoomType(roomType.id);

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  await prisma.user.create({
    data: { hotelId: hotel.id, email: TEST_EMAIL, passwordHash, role: "FRONT_DESK" },
  });

  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const checks: Array<[string, boolean]> = [];

  try {
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const { token } = (await loginRes.json()) as { token: string };

    const checkInDate = tomorrowManilaStr();
    const checkOutDate = addDaysStr(checkInDate, 1);

    // Fire all 50 requests concurrently — Promise.all, not sequential awaits —
    // each with a distinct guest email so the duplicate-submission guard (AC-8)
    // doesn't mask the concurrency result by rejecting look-alike requests as
    // duplicates instead of as sold-out.
    const requests = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
      fetch(`${base}/api/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          roomTypeId: roomType.id,
          ratePlanId: ratePlan.id,
          checkInDate,
          checkOutDate,
          quantity: 1,
          guest: { firstName: "Racer", lastName: `${i}`, email: `racer-${i}@smoke-test.local` },
        }),
      }).then((res) => res.status)
    );

    const statuses = await Promise.all(requests);
    const succeeded = statuses.filter((s) => s === 201).length;
    const rejected = statuses.filter((s) => s === 409).length;
    const unexpected = statuses.filter((s) => s !== 201 && s !== 409);

    console.log(`Statuses: ${succeeded} succeeded (201), ${rejected} rejected (409), ${unexpected.length} unexpected`);
    if (unexpected.length > 0) {
      console.log(`Unexpected statuses: ${unexpected.join(", ")}`);
    }

    checks.push([`Exactly 1 of ${CONCURRENT_REQUESTS} requests succeeded (201)`, succeeded === 1]);
    checks.push([`Exactly ${CONCURRENT_REQUESTS - 1} requests rejected cleanly (409)`, rejected === CONCURRENT_REQUESTS - 1]);
    checks.push(["No request returned an unexpected status (500, hang, etc.)", unexpected.length === 0]);

    const inventoryRow = await prisma.dailyInventory.findFirst({
      where: { roomTypeId: roomType.id, date: new Date(`${checkInDate}T00:00:00.000Z`) },
    });
    checks.push(["DailyInventory.bookedCount === 1 after the race", inventoryRow?.bookedCount === 1]);
    checks.push([
      "CHECK constraint invariant held: bookedCount + heldCount <= availableCount",
      (inventoryRow?.bookedCount ?? 0) + (inventoryRow?.heldCount ?? 0) <= (inventoryRow?.availableCount ?? 0),
    ]);

    const bookingCount = await prisma.booking.count({ where: { hotelId: hotel.id } });
    checks.push(["Exactly 1 Booking row was created", bookingCount === 1]);
  } finally {
    server.close();
  }

  let allPassed = true;
  for (const [label, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"} — ${label}`);
    if (!passed) allPassed = false;
  }

  if (!allPassed) {
    process.exitCode = 1;
    throw new Error("One or more checks failed — see FAIL lines above.");
  }

  console.log(`1 succeeded, ${CONCURRENT_REQUESTS - 1} rejected cleanly.`);
  console.log("All booking-concurrency smoke-test checks passed.");
}

main()
  .catch((err) => {
    console.error("Booking-concurrency smoke test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
