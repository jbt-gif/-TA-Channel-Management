import { prisma } from "../lib/prisma.js";

const SMOKE_HOTEL_NAME = "__smoke_test_booking_hotel__";

function tomorrowManila(): Date {
  const now = new Date();
  const manilaMs = now.getTime() + 8 * 60 * 60 * 1000;
  const manilaDate = new Date(manilaMs);
  const utcMidnight = new Date(
    Date.UTC(manilaDate.getUTCFullYear(), manilaDate.getUTCMonth(), manilaDate.getUTCDate())
  );
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() + 1);
  return utcMidnight;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isCuid(id: string): boolean {
  return /^c[a-z0-9]{20,}$/.test(id);
}

async function main() {
  // --- Cleanup any previous run (children before parents, respecting onDelete:Restrict) ---
  const existing = await prisma.hotel.findFirst({ where: { name: SMOKE_HOTEL_NAME } });
  if (existing) {
    await prisma.payment.deleteMany({ where: { hotelId: existing.id } });
    await prisma.bookingItem.deleteMany({ where: { hotelId: existing.id } });
    await prisma.booking.deleteMany({ where: { hotelId: existing.id } });
    await prisma.channelMapping.deleteMany({ where: { hotelId: existing.id } });
    await prisma.guest.deleteMany({ where: { hotelId: existing.id } });
    await prisma.ratePlanDailyRate.deleteMany({ where: { hotelId: existing.id } });
    await prisma.dailyInventory.deleteMany({ where: { hotelId: existing.id } });
    await prisma.room.deleteMany({ where: { hotelId: existing.id } });
    await prisma.ratePlan.deleteMany({ where: { hotelId: existing.id } });
    await prisma.roomType.deleteMany({ where: { hotelId: existing.id } });
    await prisma.user.deleteMany({ where: { hotelId: existing.id } });
    await prisma.hotel.delete({ where: { id: existing.id } });
    console.log("Cleaned up previous booking smoke-test run.");
  }

  const checks: Array<[string, boolean]> = [];

  // --- Setup ---
  const hotel = await prisma.hotel.create({ data: { name: SMOKE_HOTEL_NAME } });
  const frontDeskUser = await prisma.user.create({
    data: {
      hotelId: hotel.id,
      email: "frontdesk@smoke-test-booking.local",
      passwordHash: "not-a-real-hash-smoke-test-only",
      role: "FRONT_DESK",
    },
  });
  const roomType = await prisma.roomType.create({
    data: { hotelId: hotel.id, name: "Deluxe", baseCapacity: 2 },
  });
  await prisma.room.create({ data: { hotelId: hotel.id, roomTypeId: roomType.id, label: "101" } });

  const ratePlanRefundable = await prisma.ratePlan.create({
    data: {
      hotelId: hotel.id,
      roomTypeId: roomType.id,
      name: "Refundable",
      isRefundable: true,
      includesBreakfast: false,
      basePrice: 3500,
    },
  });
  const ratePlanNonRefundable = await prisma.ratePlan.create({
    data: {
      hotelId: hotel.id,
      roomTypeId: roomType.id,
      name: "Non-Refundable",
      isRefundable: false,
      includesBreakfast: false,
      basePrice: 3000,
    },
  });

  const checkInDate = tomorrowManila();
  const checkOutDate = addDays(checkInDate, 1);

  // Seed the one RatePlanDailyRate row AC-4 needs to mutate.
  await prisma.ratePlanDailyRate.create({
    data: {
      hotelId: hotel.id,
      ratePlanId: ratePlanRefundable.id,
      date: checkInDate,
      price: 3500,
      minStay: 1,
    },
  });

  const guest = await prisma.guest.create({
    data: { hotelId: hotel.id, firstName: "Smoke", lastName: "Test" },
  });

  // --- Full chain: Guest -> Booking -> BookingItem x2 -> Payment ---
  const booking = await prisma.booking.create({
    data: {
      hotelId: hotel.id,
      guestId: guest.id,
      status: "PENDING_PAYMENT",
      source: "WALK_IN",
      createdByUserId: frontDeskUser.id,
    },
  });

  const bookingItemRefundable = await prisma.bookingItem.create({
    data: {
      hotelId: hotel.id,
      bookingId: booking.id,
      roomTypeId: roomType.id,
      ratePlanId: ratePlanRefundable.id,
      checkInDate,
      checkOutDate,
      quantity: 1,
      totalPriceSnapshot: 3500,
    },
  });
  const bookingItemNonRefundable = await prisma.bookingItem.create({
    data: {
      hotelId: hotel.id,
      bookingId: booking.id,
      roomTypeId: roomType.id,
      ratePlanId: ratePlanNonRefundable.id,
      checkInDate,
      checkOutDate,
      quantity: 1,
      totalPriceSnapshot: 3000,
    },
  });

  const totalAmount = Number(bookingItemRefundable.totalPriceSnapshot) + Number(bookingItemNonRefundable.totalPriceSnapshot);
  await prisma.booking.update({ where: { id: booking.id }, data: { totalAmount } });

  const payment = await prisma.payment.create({
    data: {
      hotelId: hotel.id,
      bookingId: booking.id,
      method: "GCASH",
      status: "PENDING",
      amount: totalAmount,
      processedByUserId: frontDeskUser.id,
    },
  });

  const channelMappingRoomType = await prisma.channelMapping.create({
    data: {
      hotelId: hotel.id,
      mappingType: "ROOM_TYPE",
      roomTypeId: roomType.id,
      externalId: "channex-roomtype-placeholder-001",
    },
  });
  const channelMappingRatePlan = await prisma.channelMapping.create({
    data: {
      hotelId: hotel.id,
      mappingType: "RATE_PLAN",
      ratePlanId: ratePlanRefundable.id,
      externalId: "channex-rateplan-placeholder-001",
    },
  });

  // --- AC-1 / AC-2: hotelId scoping, traceability, cuid ids ---
  const allIds = [
    hotel.id,
    guest.id,
    booking.id,
    bookingItemRefundable.id,
    bookingItemNonRefundable.id,
    payment.id,
    channelMappingRoomType.id,
    channelMappingRatePlan.id,
  ];
  checks.push(["AC-1: all created ids are non-sequential cuids", allIds.every(isCuid)]);
  checks.push([
    "AC-2: every row carries the correct hotelId",
    [guest.hotelId, booking.hotelId, bookingItemRefundable.hotelId, payment.hotelId, channelMappingRoomType.hotelId].every(
      (id) => id === hotel.id
    ),
  ]);

  const paymentWithBooking = await prisma.payment.findUniqueOrThrow({
    where: { id: payment.id },
    include: { booking: { include: { guest: true, bookingItems: true } } },
  });
  checks.push(["AC-2: Payment traceable to Booking to Guest", paymentWithBooking.booking.guest.id === guest.id]);
  checks.push(["AC-2: Booking has both BookingItems", paymentWithBooking.booking.bookingItems.length === 2]);

  const bookingWithCreator = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    include: { createdByUser: true },
  });
  const paymentWithProcessor = await prisma.payment.findUniqueOrThrow({
    where: { id: payment.id },
    include: { processedByUser: true },
  });
  checks.push(["AC-7: Booking.createdByUser resolves correctly", bookingWithCreator.createdByUser?.id === frontDeskUser.id]);
  checks.push([
    "AC-7: Payment.processedByUser resolves correctly",
    paymentWithProcessor.processedByUser?.id === frontDeskUser.id,
  ]);

  // --- AC-5: ChannelMapping links RoomType and RatePlan independently ---
  checks.push([
    "AC-5: ChannelMapping ROOM_TYPE row links the RoomType",
    channelMappingRoomType.roomTypeId === roomType.id && channelMappingRoomType.ratePlanId === null,
  ]);
  checks.push([
    "AC-5: ChannelMapping RATE_PLAN row links the RatePlan",
    channelMappingRatePlan.ratePlanId === ratePlanRefundable.id && channelMappingRatePlan.roomTypeId === null,
  ]);

  // --- AC-4: totalPriceSnapshot is a snapshot, not a live reference ---
  await prisma.ratePlanDailyRate.update({
    where: { ratePlanId_date: { ratePlanId: ratePlanRefundable.id, date: checkInDate } },
    data: { price: 4000 },
  });
  const bookingItemAfterRateChange = await prisma.bookingItem.findUniqueOrThrow({
    where: { id: bookingItemRefundable.id },
  });
  checks.push([
    "AC-4: BookingItem.totalPriceSnapshot unchanged after RatePlanDailyRate.price changes",
    Number(bookingItemAfterRateChange.totalPriceSnapshot) === 3500,
  ]);

  // --- AC-3: cancellation is a status change, never a delete ---
  await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
  const cancelledBooking = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    include: { bookingItems: true },
  });
  checks.push(["AC-3: cancelled Booking still exists", cancelledBooking.status === "CANCELLED"]);
  checks.push(["AC-3: cancelled Booking's BookingItems still intact", cancelledBooking.bookingItems.length === 2]);

  // --- AC-6: CHECK constraints reject invalid data, using real FKs so only the CHECK fires ---
  async function expectRejected(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      checks.push([label, false]);
    } catch {
      checks.push([label, true]);
    }
  }

  await expectRejected("AC-6: BookingItem with checkOutDate <= checkInDate is rejected", () =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "BookingItem" (id, "hotelId", "bookingId", "roomTypeId", "ratePlanId", "checkInDate", "checkOutDate", quantity, "totalPriceSnapshot", "createdAt", "updatedAt")
       VALUES ('smoketestbadbki0000001', '${hotel.id}', '${booking.id}', '${roomType.id}', '${ratePlanRefundable.id}', '${checkOutDate.toISOString()}', '${checkInDate.toISOString()}', 1, 100, now(), now())`
    )
  );

  await expectRejected("AC-6: Payment with amount 0 is rejected", () =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "Payment" (id, "hotelId", "bookingId", method, status, amount, "createdAt", "updatedAt")
       VALUES ('smoketestbadpay0000001', '${hotel.id}', '${booking.id}', 'GCASH', 'PENDING', 0, now(), now())`
    )
  );

  await expectRejected("AC-6: Booking.totalAmount = 0 is rejected", () =>
    prisma.$executeRawUnsafe(`UPDATE "Booking" SET "totalAmount" = 0 WHERE id = '${booking.id}'`)
  );

  const bookingWithNullTotal = await prisma.booking.create({
    data: { hotelId: hotel.id, guestId: guest.id, status: "PENDING_PAYMENT", source: "WALK_IN" },
  });
  checks.push([
    "AC-6: fresh Booking with totalAmount left null is accepted",
    bookingWithNullTotal.totalAmount === null,
  ]);

  // --- Report ---
  let allPassed = true;
  for (const [label, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"} — ${label}`);
    if (!passed) allPassed = false;
  }

  if (!allPassed) {
    process.exitCode = 1;
    throw new Error("One or more checks failed — see FAIL lines above.");
  }

  console.log("All booking smoke-test checks passed.");
}

main()
  .catch((err) => {
    console.error("Booking smoke test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
