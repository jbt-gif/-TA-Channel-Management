import bcrypt from "bcryptjs";
import type { AddressInfo } from "node:net";
import { app } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { seedInventoryForRoomType } from "../lib/seed-inventory.js";

const HOTEL_A_NAME = "__smoke_test_booking_flow_hotel_A__";
const HOTEL_B_NAME = "__smoke_test_booking_flow_hotel_B__";
const FRONT_DESK_EMAIL = "bookingflowsmoketest.frontdesk@smoke-test.local";
const HOUSEKEEPING_EMAIL = "bookingflowsmoketest.housekeeping@smoke-test.local";
const TEST_PASSWORD = "BookingFlowSmokeTest123!";

async function cleanupHotel(name: string) {
  const hotel = await prisma.hotel.findFirst({ where: { name } });
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

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function tomorrowManilaStr(): string {
  const manilaMs = Date.now() + 8 * 60 * 60 * 1000;
  const d = new Date(manilaMs);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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
  await prisma.room.create({ data: { hotelId: hotelA.id, roomTypeId: roomTypeA.id, label: "102" } });
  const ratePlanA = await prisma.ratePlan.create({
    data: {
      hotelId: hotelA.id,
      roomTypeId: roomTypeA.id,
      name: "Flex",
      isRefundable: true,
      includesBreakfast: false,
      basePrice: 3500,
    },
  });
  await seedInventoryForRoomType(roomTypeA.id);

  const roomTypeB = await prisma.roomType.create({
    data: { hotelId: hotelB.id, name: "Standard", baseCapacity: 2 },
  });

  const throwaway = await prisma.roomType.create({
    data: { hotelId: hotelB.id, name: "Throwaway", baseCapacity: 1 },
  });
  const nonexistentRoomTypeId = throwaway.id;
  await prisma.roomType.delete({ where: { id: throwaway.id } });

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  await prisma.user.create({
    data: { hotelId: hotelA.id, email: FRONT_DESK_EMAIL, passwordHash, role: "FRONT_DESK" },
  });
  await prisma.user.create({
    data: { hotelId: hotelA.id, email: HOUSEKEEPING_EMAIL, passwordHash, role: "HOUSEKEEPING" },
  });

  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const checks: Array<[string, boolean]> = [];
  const D0 = tomorrowManilaStr();

  async function login(email: string): Promise<string> {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    });
    const { token } = (await res.json()) as { token: string };
    return token;
  }

  function bookingBody(checkInDate: string, checkOutDate: string, email?: string) {
    return {
      roomTypeId: roomTypeA.id,
      ratePlanId: ratePlanA.id,
      checkInDate,
      checkOutDate,
      quantity: 1,
      guest: { firstName: "Smoke", lastName: "Test", email },
    };
  }

  try {
    const token = await login(FRONT_DESK_EMAIL);
    const housekeepingToken = await login(HOUSEKEEPING_EMAIL);
    const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // AC-1: valid 2-night booking, correct totalAmount
    const validCheckIn = addDaysStr(D0, 0);
    const validCheckOut = addDaysStr(D0, 2);
    const validRes = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(bookingBody(validCheckIn, validCheckOut, "flow-valid@smoke-test.local")),
    });
    const validBody = (await validRes.json()) as { totalAmount: string; bookingItems: Array<{ totalPriceSnapshot: string }> };
    checks.push(["AC-1: valid booking returns 201", validRes.status === 201]);
    checks.push(["AC-1: totalAmount is 2 nights x 3500 = 7000.00", Number(validBody.totalAmount) === 7000]);
    checks.push([
      "AC-1: bookingItem totalPriceSnapshot matches totalAmount",
      Number(validBody.bookingItems?.[0]?.totalPriceSnapshot) === 7000,
    ]);

    // AC-2: cross-tenant roomTypeId and genuinely-nonexistent roomTypeId — byte-identical 404
    const crossTenantRes = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ ...bookingBody(validCheckIn, validCheckOut), roomTypeId: roomTypeB.id }),
    });
    const crossTenantBody = await crossTenantRes.text();
    checks.push(["AC-2: cross-tenant roomTypeId returns 404", crossTenantRes.status === 404]);

    const nonexistentRes = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ ...bookingBody(validCheckIn, validCheckOut), roomTypeId: nonexistentRoomTypeId }),
    });
    const nonexistentBody = await nonexistentRes.text();
    checks.push(["AC-2: nonexistent roomTypeId returns 404", nonexistentRes.status === 404]);
    checks.push(["AC-2: cross-tenant and nonexistent-id responses are byte-identical", crossTenantBody === nonexistentBody]);

    // AC-5: checkOutDate <= checkInDate
    const badRangeRes = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(bookingBody(validCheckIn, validCheckIn)),
    });
    checks.push(["AC-5: checkOutDate == checkInDate returns 400", badRangeRes.status === 400]);

    // AC-5: 45-night stay exceeds max
    const tooLongRes = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(bookingBody(addDaysStr(D0, 40), addDaysStr(D0, 85))),
    });
    checks.push(["AC-5: 45-night stay returns 400", tooLongRes.status === 400]);

    // Security-review finding: guest.email must be type-checked before use in
    // Prisma `where` filters — an operator object like {"not": null} would
    // otherwise match an arbitrary existing Guest instead of the intended
    // exact-match lookup.
    const injectionRes = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        ...bookingBody(addDaysStr(D0, 60), addDaysStr(D0, 61)),
        guest: { firstName: "X", lastName: "Y", email: { not: null } },
      }),
    });
    checks.push(["Security: non-string guest.email (operator-injection shape) returns 400", injectionRes.status === 400]);

    // AC-6: missing Authorization header
    const noAuthRes = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingBody(validCheckIn, validCheckOut)),
    });
    checks.push(["AC-6: missing Authorization header returns 401", noAuthRes.status === 401]);

    // AC-7: HOUSEKEEPING role forbidden
    const housekeepingRes = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${housekeepingToken}` },
      body: JSON.stringify(bookingBody(addDaysStr(D0, 50), addDaysStr(D0, 51))),
    });
    checks.push(["AC-7: HOUSEKEEPING role returns 403", housekeepingRes.status === 403]);

    // AC-8: rapid duplicate submission
    const dupIn = addDaysStr(D0, 30);
    const dupOut = addDaysStr(D0, 32);
    const dupEmail = "flow-dup@smoke-test.local";
    const dup1Res = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(bookingBody(dupIn, dupOut, dupEmail)),
    });
    const dup2Res = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(bookingBody(dupIn, dupOut, dupEmail)),
    });
    checks.push(["AC-8: first submission returns 201", dup1Res.status === 201]);
    checks.push(["AC-8: immediate duplicate submission returns 409", dup2Res.status === 409]);
    const dupBookingCount = await prisma.booking.count({
      where: {
        hotelId: hotelA.id,
        guest: { email: dupEmail },
        bookingItems: {
          some: {
            roomTypeId: roomTypeA.id,
            checkInDate: new Date(`${dupIn}T00:00:00.000Z`),
            checkOutDate: new Date(`${dupOut}T00:00:00.000Z`),
          },
        },
      },
    });
    checks.push(["AC-8: exactly one Booking exists after duplicate submission", dupBookingCount === 1]);

    // AC-9: a date in range has no RatePlanDailyRate row
    const gapIn = addDaysStr(D0, 20);
    const gapOut = addDaysStr(D0, 22);
    const gapMiddleDate = addDaysStr(D0, 21);
    await prisma.ratePlanDailyRate.deleteMany({
      where: { ratePlanId: ratePlanA.id, date: new Date(`${gapMiddleDate}T00:00:00.000Z`) },
    });
    const beforeGapBookingCount = await prisma.booking.count({ where: { hotelId: hotelA.id } });
    const gapRes = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(bookingBody(gapIn, gapOut, "flow-gap@smoke-test.local")),
    });
    const afterGapBookingCount = await prisma.booking.count({ where: { hotelId: hotelA.id } });
    checks.push(["AC-9: date range with missing RatePlanDailyRate returns 409", gapRes.status === 409]);
    checks.push(["AC-9: no Booking created for the rejected gap request", afterGapBookingCount === beforeGapBookingCount]);

    // AC-4: multi-night all-or-nothing rollback — middle date sold out
    const rollIn = addDaysStr(D0, 10);
    const rollMiddle = addDaysStr(D0, 11);
    const rollOut = addDaysStr(D0, 13);
    await prisma.dailyInventory.updateMany({
      where: { roomTypeId: roomTypeA.id, date: new Date(`${rollMiddle}T00:00:00.000Z`) },
      data: { bookedCount: 2 }, // matches availableCount seeded above (2 Rooms) — fully sold out for this one date
    });
    const rollRes = await fetch(`${base}/api/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(bookingBody(rollIn, rollOut, "flow-rollback@smoke-test.local")),
    });
    checks.push(["AC-4: booking spanning a sold-out middle date returns 409", rollRes.status === 409]);
    const firstNightRow = await prisma.dailyInventory.findFirst({
      where: { roomTypeId: roomTypeA.id, date: new Date(`${rollIn}T00:00:00.000Z`) },
    });
    checks.push(["AC-4: first night's bookedCount was rolled back to 0", firstNightRow?.bookedCount === 0]);
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

  console.log("All booking-flow smoke-test checks passed.");
}

main()
  .catch((err) => {
    console.error("Booking-flow smoke test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupHotel(HOTEL_A_NAME);
    await cleanupHotel(HOTEL_B_NAME);
    await prisma.$disconnect();
  });
