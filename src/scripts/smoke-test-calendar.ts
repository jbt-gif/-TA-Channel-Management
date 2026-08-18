import bcrypt from "bcryptjs";
import type { AddressInfo } from "node:net";
import { app } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { seedInventoryForRoomType } from "../lib/seed-inventory.js";

const HOTEL_A_NAME = "__smoke_test_calendar_hotel_A__";
const HOTEL_B_NAME = "__smoke_test_calendar_hotel_B__";
const TEST_EMAIL = "calendarsmoketest@smoke-test.local";
const TEST_PASSWORD = "CalendarSmokeTest123!";

async function cleanupHotel(name: string) {
  const hotel = await prisma.hotel.findFirst({ where: { name } });
  if (!hotel) return;
  await prisma.dailyInventory.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.ratePlanDailyRate.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.ratePlan.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.room.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.roomType.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.user.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.hotel.delete({ where: { id: hotel.id } });
}

async function main() {
  await cleanupHotel(HOTEL_A_NAME);
  await cleanupHotel(HOTEL_B_NAME);

  const hotelA = await prisma.hotel.create({ data: { name: HOTEL_A_NAME } });
  const hotelB = await prisma.hotel.create({ data: { name: HOTEL_B_NAME } });

  const roomTypeA = await prisma.roomType.create({
    data: { hotelId: hotelA.id, name: "Deluxe", baseCapacity: 2 },
  });
  await prisma.room.create({ data: { hotelId: hotelA.id, roomTypeId: roomTypeA.id, label: "101" } });
  const ratePlanA1 = await prisma.ratePlan.create({
    data: { hotelId: hotelA.id, roomTypeId: roomTypeA.id, name: "Flex", isRefundable: true, includesBreakfast: false, basePrice: 3500 },
  });
  const ratePlanA2 = await prisma.ratePlan.create({
    data: { hotelId: hotelA.id, roomTypeId: roomTypeA.id, name: "Saver", isRefundable: false, includesBreakfast: false, basePrice: 3000 },
  });
  await seedInventoryForRoomType(roomTypeA.id);

  const roomTypeB = await prisma.roomType.create({
    data: { hotelId: hotelB.id, name: "Standard", baseCapacity: 2 },
  });

  // A genuinely nonexistent-but-valid-shaped cuid: create then delete a RoomType.
  const throwaway = await prisma.roomType.create({
    data: { hotelId: hotelB.id, name: "Throwaway", baseCapacity: 1 },
  });
  const nonexistentRoomTypeId = throwaway.id;
  await prisma.roomType.delete({ where: { id: throwaway.id } });

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  await prisma.user.create({
    data: { hotelId: hotelA.id, email: TEST_EMAIL, passwordHash, role: "FRONT_DESK" },
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

    // AC-1 / AC-2: room-types list scoped to Hotel A, Hotel B's id absent
    const listRes = await fetch(`${base}/api/room-types`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = (await listRes.json()) as Array<{ id: string }>;
    const ids = listBody.map((rt) => rt.id);
    checks.push(["AC-1: room-types list returns 200", listRes.status === 200]);
    checks.push(["AC-1: Hotel A's room type is present", ids.includes(roomTypeA.id)]);
    checks.push(["AC-2: Hotel B's room type is absent", !ids.includes(roomTypeB.id)]);

    // AC-3: calendar grid for own room type
    const startDate = new Date().toISOString().slice(0, 10);
    const gridRes = await fetch(
      `${base}/api/room-types/${roomTypeA.id}/calendar?startDate=${startDate}&endDate=${startDate}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const gridBody = (await gridRes.json()) as {
      days: Array<{ date: string; seeded: boolean; rates: Record<string, { price: string; minStay: number }> }>;
    };
    checks.push(["AC-3: calendar grid returns 200", gridRes.status === 200]);
    checks.push(["AC-3: days array has exactly 1 entry for a 1-day range", gridBody.days.length === 1]);
    const day = gridBody.days[0];
    checks.push(["AC-3: day is marked seeded", day?.seeded === true]);
    checks.push([
      "AC-3: day's rates include both Hotel A rate plans with seeded prices",
      day?.rates[ratePlanA1.id]?.price !== undefined && day?.rates[ratePlanA2.id]?.price !== undefined,
    ]);

    // AC-4: cross-tenant roomTypeId (Hotel B's real room type, Hotel A's token)
    const crossTenantRes = await fetch(
      `${base}/api/room-types/${roomTypeB.id}/calendar?startDate=${startDate}&endDate=${startDate}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const crossTenantBody = await crossTenantRes.text();
    checks.push(["AC-4: cross-tenant roomTypeId returns 404", crossTenantRes.status === 404]);

    // AC-4: genuinely nonexistent roomTypeId — must be indistinguishable from cross-tenant case
    const nonexistentRes = await fetch(
      `${base}/api/room-types/${nonexistentRoomTypeId}/calendar?startDate=${startDate}&endDate=${startDate}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const nonexistentBody = await nonexistentRes.text();
    checks.push(["AC-4: nonexistent roomTypeId returns 404", nonexistentRes.status === 404]);
    checks.push([
      "AC-4: cross-tenant and nonexistent-id responses are byte-identical",
      crossTenantBody === nonexistentBody,
    ]);

    // AC-5: unauthenticated requests rejected
    const noAuthListRes = await fetch(`${base}/api/room-types`);
    checks.push(["AC-5: room-types list with no auth returns 401", noAuthListRes.status === 401]);
    const noAuthCalendarRes = await fetch(
      `${base}/api/room-types/${roomTypeA.id}/calendar?startDate=${startDate}&endDate=${startDate}`
    );
    checks.push(["AC-5: calendar with no auth returns 401", noAuthCalendarRes.status === 401]);

    // AC-6: invalid date ranges
    const noStartRes = await fetch(`${base}/api/room-types/${roomTypeA.id}/calendar?endDate=${startDate}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    checks.push(["AC-6: missing startDate returns 400", noStartRes.status === 400]);

    const backwardsRes = await fetch(
      `${base}/api/room-types/${roomTypeA.id}/calendar?startDate=2026-08-18&endDate=2026-08-16`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    checks.push(["AC-6: endDate before startDate returns 400", backwardsRes.status === 400]);

    const tooLongRes = await fetch(
      `${base}/api/room-types/${roomTypeA.id}/calendar?startDate=2026-01-01&endDate=2027-06-15`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    checks.push(["AC-6: 500+ day range returns 400", tooLongRes.status === 400]);

    const impossibleDateRes = await fetch(
      `${base}/api/room-types/${roomTypeA.id}/calendar?startDate=2026-02-30&endDate=2026-03-05`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    checks.push(["AC-6: round-trip-invalid date (2026-02-30) returns 400", impossibleDateRes.status === 400]);
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

  console.log("All calendar smoke-test checks passed.");
}

main()
  .catch((err) => {
    console.error("Calendar smoke test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
